"""
Simplified Flask Application Entry Point
"""
import os
import sys
import hmac
import logging
from pathlib import Path
from sqlalchemy import event
from sqlalchemy.engine import Engine
import sqlite3
from sqlalchemy.exc import SQLAlchemyError
from flask_migrate import Migrate

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:
    load_dotenv = None

if sys.platform == 'win32':
    if sys.stdout is not None:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if sys.stderr is not None:
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# Load environment variables from project root .env file
_project_root = Path(__file__).parent.parent
_env_file = _project_root / '.env'
if load_dotenv is not None:
    load_dotenv(dotenv_path=_env_file, override=True)

from flask import Flask
from flask_cors import CORS
from branding import API_DESCRIPTION, API_NAME, API_RUNNING_MESSAGE
from models import db
from config import Config, DEFAULT_BACKEND_PORT, DEFAULT_FRONTEND_PORT
from controllers.material_controller import material_bp, material_global_bp
from controllers.reference_file_controller import reference_file_bp
from controllers.settings_controller import settings_bp
from controllers.openai_oauth_controller import openai_oauth_bp
from controllers import server_task_bp, project_bp, page_bp, template_bp, user_template_bp, user_style_template_bp, export_bp, file_bp, style_bp, native_deck_bp, narration_bp, content_workspace_bp, podcast_bp, workspace_generation_bp, voice_catalog_bp


# Enable SQLite WAL mode for all connections
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_conn, connection_record):
    """
    Enable WAL mode and related PRAGMAs for each SQLite connection.
    Registered once at import time to avoid duplicate handlers when
    create_app() is called multiple times.
    """
    # Only apply to SQLite connections
    if not isinstance(dbapi_conn, sqlite3.Connection):
        return

    cursor = dbapi_conn.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=60000")  # 60 seconds timeout
    finally:
        cursor.close()


def create_app():
    """Application factory"""
    app = Flask(__name__)
    
    # Load configuration from Config class
    app.config.from_object(Config)

    # Allow DATABASE_URL env var to override config at runtime (supports test isolation)
    if os.getenv('DATABASE_URL'):
        app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')

    # Ensure instance directory exists for the default SQLite path in Config
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    instance_dir = os.path.join(backend_dir, 'instance')
    os.makedirs(instance_dir, exist_ok=True)

    # Ensure upload folder exists
    project_root = os.path.dirname(backend_dir)
    upload_folder = os.path.join(project_root, 'uploads')
    os.makedirs(upload_folder, exist_ok=True)
    app.config['UPLOAD_FOLDER'] = upload_folder

    database_path = os.getenv('DATABASE_PATH', '').strip()
    if database_path:
        os.makedirs(os.path.dirname(database_path), exist_ok=True)
        app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{database_path}'

    upload_folder_override = os.getenv('UPLOAD_FOLDER', '').strip()
    if upload_folder_override:
        os.makedirs(upload_folder_override, exist_ok=True)
        app.config['UPLOAD_FOLDER'] = upload_folder_override

    export_folder = os.getenv('EXPORT_FOLDER', '').strip()
    if export_folder:
        os.makedirs(export_folder, exist_ok=True)
        app.config['EXPORT_FOLDER'] = export_folder
    
    # CORS configuration (parse from environment)
    raw_cors = os.getenv('CORS_ORIGINS', f'http://localhost:{DEFAULT_FRONTEND_PORT}')
    if raw_cors.strip() == '*':
        cors_origins = '*'
    else:
        cors_origins = [o.strip() for o in raw_cors.split(',') if o.strip()]
    app.config['CORS_ORIGINS'] = cors_origins
    
    # Initialize logging (log to stdout so Docker can capture it)
    log_level = getattr(logging, app.config['LOG_LEVEL'], logging.INFO)
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )
    
    # 设置第三方库的日志级别，避免过多的DEBUG日志
    logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)
    logging.getLogger('httpcore').setLevel(logging.WARNING)
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    werkzeug_log_level = app.config.get('WERKZEUG_LOG_LEVEL', 'INFO')
    if isinstance(werkzeug_log_level, str):
        werkzeug_log_level = werkzeug_log_level.strip()
        werkzeug_log_level = (
            int(werkzeug_log_level)
            if werkzeug_log_level.isdigit()
            else werkzeug_log_level.upper()
        )
    werkzeug_logger = logging.getLogger('werkzeug')
    try:
        werkzeug_logger.setLevel(werkzeug_log_level)
    except (ValueError, TypeError):
        werkzeug_logger.setLevel(logging.INFO)
    logging.getLogger('volcenginesdkarkruntime').setLevel(logging.WARNING)

    _prepare_content_project_database(app)

    # Initialize extensions
    db.init_app(app)
    CORS(app, origins=cors_origins)
    # Database migrations (Alembic via Flask-Migrate)
    Migrate(app, db)
    
    # Register blueprints
    app.register_blueprint(project_bp)
    app.register_blueprint(server_task_bp)
    app.register_blueprint(voice_catalog_bp)
    app.register_blueprint(page_bp)
    app.register_blueprint(template_bp)
    app.register_blueprint(user_template_bp)
    app.register_blueprint(user_style_template_bp)
    app.register_blueprint(export_bp)
    app.register_blueprint(file_bp)
    app.register_blueprint(material_bp)
    app.register_blueprint(material_global_bp)
    app.register_blueprint(reference_file_bp, url_prefix='/api/reference-files')
    app.register_blueprint(settings_bp)
    app.register_blueprint(openai_oauth_bp)
    app.register_blueprint(style_bp)
    app.register_blueprint(native_deck_bp)
    app.register_blueprint(narration_bp)
    app.register_blueprint(content_workspace_bp)
    app.register_blueprint(podcast_bp)
    app.register_blueprint(workspace_generation_bp)

    with app.app_context():
        db.create_all()
        _ensure_desktop_sqlite_schema(app)
        from bootstrap_settings import import_packaged_credentials
        import_packaged_credentials(os.getenv('EASYSLIDE_BOOTSTRAP_SETTINGS_PATH'))
        _pause_interrupted_export_tasks()
        _recover_interrupted_generation_runs()
        # Load settings from database and sync to app.config
        _load_settings_to_config(app)

    # Access code enforcement on all /api/ routes
    @app.before_request
    def _enforce_access_code():
        from flask import request, jsonify
        expected = os.getenv('ACCESS_CODE', '').strip()
        if not expected:
            return  # not enabled
        if not request.path.startswith('/api/'):
            return  # non-API routes (health, static, etc.)
        if request.path == '/api/projects/tasks/pause-active-exports':
            return  # local desktop shutdown hook
        if request.path.startswith('/api/access-code/'):
            return  # allow check/verify endpoints
        code = request.headers.get('X-Access-Code', '')
        if hmac.compare_digest(code, expected):
            return
        return jsonify({'error': 'Access code required'}), 403

    # Health check endpoint
    @app.route('/health')
    def health_check():
        return {'status': 'ok', 'message': API_RUNNING_MESSAGE}

    # Access code verification
    @app.route('/api/access-code/check', methods=['GET'])
    def check_access_code():
        """Check if access code protection is enabled"""
        enabled = bool(os.getenv('ACCESS_CODE', '').strip())
        return {'data': {'enabled': enabled}}

    @app.route('/api/access-code/verify', methods=['POST'])
    def verify_access_code():
        """Verify the provided access code"""
        from flask import request, jsonify
        expected = os.getenv('ACCESS_CODE', '').strip()
        if not expected:
            return {'data': {'valid': True}}
        code = (request.json or {}).get('code', '')
        if hmac.compare_digest(code, expected):
            return {'data': {'valid': True}}
        return jsonify({'error': 'Invalid access code'}), 403
    
    # Output language endpoint
    @app.route('/api/output-language', methods=['GET'])
    def get_output_language():
        """
        获取用户的输出语言偏好（从数据库 Settings 读取）
        返回: zh, ja, en, auto
        """
        from models import Settings
        try:
            settings = Settings.get_settings()
            return {'data': {'language': settings.output_language or Config.OUTPUT_LANGUAGE}}
        except SQLAlchemyError as db_error:
            logging.warning(f"Failed to load output language from settings: {db_error}")
            return {'data': {'language': Config.OUTPUT_LANGUAGE}}  # 默认中文

    # Root endpoint
    @app.route('/')
    def index():
        return {
            'name': API_NAME,
            'version': '1.0.0',
            'description': API_DESCRIPTION,
            'endpoints': {
                'health': '/health',
                'api_docs': '/api',
                'projects': '/api/projects'
            }
        }
    
    return app


def _prepare_content_project_database(app):
    """Run the gated offline migration before SQLAlchemy opens the business DB."""
    enabled = os.getenv('CONTENT_PROJECT_CUTOVER', '').strip().lower()
    from services.content_project_migration import prepare_content_project_database

    return prepare_content_project_database(
        app.config['SQLALCHEMY_DATABASE_URI'],
        app.config['UPLOAD_FOLDER'],
        enabled=enabled in {'1', 'true', 'yes', 'on'},
    )


def _pause_interrupted_export_tasks():
    """In-memory tasks cannot keep running after the desktop backend exits."""
    from models import Page, Task

    tasks = Task.query.filter(
        Task.task_type.in_([
            'EXPORT_EDITABLE_PPTX', 'EXPORT_NATIVE_PPTX', 'EXPORT_NATIVE_PDF',
            'EXPORT_NATIVE_HTML', 'EXPORT_VIDEO', 'EXPORT_VIDEO_WORKSPACE',
            'EXPORT_PODCAST_WORKSPACE', 'GENERATE_IMAGES',
            'INITIALIZE_CONTENT_WORKSPACE',
        ]),
        Task.status.in_(['PENDING', 'PROCESSING', 'RUNNING']),
    ).all()
    for task in tasks:
        task.status = 'PAUSED'
        if task.task_type == 'GENERATE_IMAGES':
            page_ids = task.get_progress().get('page_ids')
            if isinstance(page_ids, list):
                Page.query.filter(
                    Page.id.in_(page_ids),
                    Page.generated_image_path.is_(None),
                ).update({'status': 'QUEUED'}, synchronize_session=False)
    if tasks:
        db.session.commit()


def _recover_interrupted_generation_runs():
    """重启后恢复生成运行：任务已消失/结束的运行标记为可恢复（PAUSED）。

    恢复只调整运行状态，绝不自动发布候选，也不改写正式工作区。
    """
    from models import Task, WorkspaceGenerationRun

    runs = WorkspaceGenerationRun.query.filter(
        WorkspaceGenerationRun.status.in_(['PENDING', 'RUNNING']),
    ).all()
    changed = False
    for run in runs:
        task = db.session.get(Task, run.task_id) if run.task_id else None
        if task and task.status in {'PENDING', 'PROCESSING', 'RUNNING', 'PAUSED'}:
            continue  # 任务仍然存活（含用户暂停）
        # 系统恢复路径：绕过状态机的 PENDING→PAUSED 限制，标记为用户可恢复
        run.status = 'PAUSED'
        changed = True
    if changed:
        db.session.commit()


def _ensure_desktop_sqlite_schema(app):
    """Add columns that db.create_all() cannot add to upgraded desktop SQLite DBs."""
    if not app.config['SQLALCHEMY_DATABASE_URI'].startswith('sqlite:///'):
        return

    cutover_enabled = os.getenv('CONTENT_PROJECT_CUTOVER', '').strip().lower() in {
        '1', 'true', 'yes', 'on',
    }
    from services.content_project_migration import desktop_legacy_project_columns

    columns = {
        'projects': {
            'project_title': 'TEXT',
            'extra_requirements': 'TEXT',
            'outline_requirements': 'TEXT',
            'description_requirements': 'TEXT',
            **desktop_legacy_project_columns(cutover_enabled=cutover_enabled),
            'export_extractor_method': "VARCHAR(50) DEFAULT 'hybrid'",
            'export_inpaint_method': "VARCHAR(50) DEFAULT 'hybrid'",
            'export_allow_partial': 'BOOLEAN DEFAULT 0',
            'export_high_fidelity_editable': 'BOOLEAN NOT NULL DEFAULT 0',
            'enable_icon_subject_extraction': 'BOOLEAN DEFAULT 0',
            'template_pack_id': 'VARCHAR(120)',
            'schema_version': 'INTEGER NOT NULL DEFAULT 1',
            'last_workspace': 'VARCHAR(20)',
            'migration_state': 'VARCHAR(30)',
            'project_settings_json': 'TEXT',
        },
        'pages': {
            'part': 'VARCHAR(200)',
            'cached_image_path': 'VARCHAR(500)',
            'template_image_path': 'VARCHAR(500)',
            'template_style_text': 'TEXT',
            'template_selection_role': 'VARCHAR(40)',
            'template_selection_layout': 'VARCHAR(40)',
            'template_selection_source': 'VARCHAR(40)',
            'template_match_reason': 'TEXT',
            'narration_text': 'TEXT',
            'narration_segments': 'TEXT',
            'narration_source_hash': 'VARCHAR(64)',
            'narration_config_hash': 'VARCHAR(64)',
            'narration_status': 'VARCHAR(32)',
            'narration_audio_manifest': 'TEXT',
            'narration_error': 'TEXT',
            'current_narration_version_id': 'VARCHAR(36)',
            'narration_locked': 'BOOLEAN NOT NULL DEFAULT 0',
            'narration_revision': 'INTEGER NOT NULL DEFAULT 0',
            'native_layout': 'VARCHAR(100)',
            'native_props': 'TEXT',
            'native_versions': 'TEXT',
        },
        'tasks': {
            'dismissed_at': 'DATETIME',
        },
        'settings': {
            'text_model': 'VARCHAR(100)',
            'image_model': 'VARCHAR(100)',
            'mineru_api_base': 'VARCHAR(255)',
            'mineru_token': 'VARCHAR(500)',
            'image_caption_model': 'VARCHAR(100)',
            'output_language': 'VARCHAR(10)',
            'enable_text_reasoning': 'BOOLEAN DEFAULT 0',
            'text_thinking_budget': 'INTEGER DEFAULT 1024',
            'enable_image_reasoning': 'BOOLEAN DEFAULT 0',
            'image_thinking_budget': 'INTEGER DEFAULT 1024',
            'enable_image_quality_control': 'BOOLEAN DEFAULT 0',
            'description_generation_mode': 'VARCHAR(20)',
            'description_extra_fields': 'TEXT',
            'image_prompt_extra_fields': 'TEXT',
            'baidu_api_key': 'VARCHAR(500)',
            'text_model_source': 'VARCHAR(50)',
            'image_model_source': 'VARCHAR(50)',
            'image_caption_model_source': 'VARCHAR(50)',
            'lazyllm_api_keys': 'TEXT',
            'text_api_key': 'VARCHAR(500)',
            'text_api_base_url': 'VARCHAR(500)',
            'image_api_key': 'VARCHAR(500)',
            'image_api_base_url': 'VARCHAR(500)',
            'image_caption_api_key': 'VARCHAR(500)',
            'image_caption_api_base_url': 'VARCHAR(500)',
            'fish_audio_api_key': 'TEXT',
            'fish_audio_voice_assets': 'TEXT',
            'openai_image_api_protocol': 'VARCHAR(10)',
            'openai_oauth_access_token': 'TEXT',
            'openai_oauth_refresh_token': 'TEXT',
            'openai_oauth_expires_at': 'DATETIME',
            'openai_oauth_account_id': 'VARCHAR(100)',
        },
        'user_templates': {
            'thumb_path': 'VARCHAR(500)',
            'file_size': 'INTEGER',
        },
        'materials': {
            'media_kind': "VARCHAR(20) NOT NULL DEFAULT 'image'",
            'purpose': "VARCHAR(30) NOT NULL DEFAULT 'image'",
            'mime_type': 'VARCHAR(100)',
            'duration_ms': 'INTEGER',
            'source_note': 'TEXT',
            'license_status': 'VARCHAR(30)',
        },
    }
    try:
        with db.engine.begin() as conn:
            for table, table_columns in columns.items():
                existing = {row[1] for row in conn.exec_driver_sql(f'PRAGMA table_info({table})')}
                for name, definition in table_columns.items():
                    if name not in existing:
                        conn.exec_driver_sql(f'ALTER TABLE {table} ADD COLUMN {name} {definition}')
    except Exception as exc:
        logging.warning(f"Could not update desktop SQLite schema: {exc}")


def _load_settings_to_config(app):
    """Load settings from database and apply to app.config on startup"""
    from models import Settings
    try:
        settings = Settings.get_settings()
        
        # Load AI provider format (always sync, has default value)
        if settings.ai_provider_format:
            app.config['AI_PROVIDER_FORMAT'] = settings.ai_provider_format
            logging.info(f"Loaded AI_PROVIDER_FORMAT from settings: {settings.ai_provider_format}")
        
        # Load API configuration
        # Note: We load even if value is None/empty to allow clearing settings
        # But we only log if there's an actual value
        if settings.api_base_url is not None:
            # 将数据库中的统一 API Base 同步到 Google/OpenAI 两个配置，确保覆盖环境变量
            app.config['GOOGLE_API_BASE'] = settings.api_base_url
            app.config['OPENAI_API_BASE'] = settings.api_base_url
            if settings.api_base_url:
                logging.info(f"Loaded API_BASE from settings: {settings.api_base_url}")
            else:
                logging.info("API_BASE is empty in settings, using env var or default")

        if settings.api_key is not None:
            # 同步到两个提供商的 key，数据库优先于环境变量
            app.config['GOOGLE_API_KEY'] = settings.api_key
            app.config['OPENAI_API_KEY'] = settings.api_key
            if settings.api_key:
                logging.info("Loaded API key from settings")
            else:
                logging.info("API key is empty in settings, using env var or default")

        # Load image generation settings (fall back to .env/Config when NULL)
        resolution = settings.image_resolution or Config.DEFAULT_RESOLUTION
        aspect_ratio = settings.image_aspect_ratio or Config.DEFAULT_ASPECT_RATIO
        app.config['DEFAULT_RESOLUTION'] = resolution
        app.config['DEFAULT_ASPECT_RATIO'] = aspect_ratio
        logging.info(f"Loaded image settings: {resolution}, {aspect_ratio}")

        # Load worker settings (fall back to .env/Config when NULL)
        desc_workers = settings.max_description_workers or Config.MAX_DESCRIPTION_WORKERS
        img_workers = settings.max_image_workers or Config.MAX_IMAGE_WORKERS
        app.config['MAX_DESCRIPTION_WORKERS'] = desc_workers
        app.config['MAX_IMAGE_WORKERS'] = img_workers
        from services.task_manager import sync_resource_limits
        sync_resource_limits(desc_workers, img_workers)
        logging.info(f"Loaded worker settings: desc={desc_workers}, img={img_workers}")

        # Load model settings (FIX for Issue #136: these were missing before)
        if settings.text_model:
            app.config['TEXT_MODEL'] = settings.text_model
            logging.info(f"Loaded TEXT_MODEL from settings: {settings.text_model}")
        
        if settings.image_model:
            app.config['IMAGE_MODEL'] = settings.image_model
            logging.info(f"Loaded IMAGE_MODEL from settings: {settings.image_model}")
        
        # Load MinerU settings
        if settings.mineru_api_base:
            app.config['MINERU_API_BASE'] = settings.mineru_api_base
            logging.info(f"Loaded MINERU_API_BASE from settings: {settings.mineru_api_base}")
        
        if settings.mineru_token:
            app.config['MINERU_TOKEN'] = settings.mineru_token
            logging.info("Loaded MINERU_TOKEN from settings")
        
        # Load image caption model
        if settings.image_caption_model:
            app.config['IMAGE_CAPTION_MODEL'] = settings.image_caption_model
            logging.info(f"Loaded IMAGE_CAPTION_MODEL from settings: {settings.image_caption_model}")
        
        # Load output language
        if settings.output_language:
            app.config['OUTPUT_LANGUAGE'] = settings.output_language
            logging.info(f"Loaded OUTPUT_LANGUAGE from settings: {settings.output_language}")
        
        # Load reasoning mode settings (separate for text and image)
        app.config['ENABLE_TEXT_REASONING'] = settings.enable_text_reasoning
        app.config['TEXT_THINKING_BUDGET'] = settings.text_thinking_budget
        app.config['ENABLE_IMAGE_REASONING'] = settings.enable_image_reasoning
        app.config['IMAGE_THINKING_BUDGET'] = settings.image_thinking_budget
        app.config['ENABLE_IMAGE_QUALITY_CONTROL'] = settings.enable_image_quality_control
        logging.info(f"Loaded reasoning config: text={settings.enable_text_reasoning}(budget={settings.text_thinking_budget}), image={settings.enable_image_reasoning}(budget={settings.image_thinking_budget})")
        
        # Load Baidu API settings
        if settings.baidu_api_key:
            app.config['BAIDU_API_KEY'] = settings.baidu_api_key
            logging.info("Loaded BAIDU_API_KEY from settings")

        # Load LazyLLM source settings
        if settings.text_model_source:
            app.config['TEXT_MODEL_SOURCE'] = settings.text_model_source
            logging.info(f"Loaded TEXT_MODEL_SOURCE from settings: {settings.text_model_source}")
        if settings.image_model_source:
            app.config['IMAGE_MODEL_SOURCE'] = settings.image_model_source
            logging.info(f"Loaded IMAGE_MODEL_SOURCE from settings: {settings.image_model_source}")
        if settings.image_caption_model_source:
            app.config['IMAGE_CAPTION_MODEL_SOURCE'] = settings.image_caption_model_source
            logging.info(f"Loaded IMAGE_CAPTION_MODEL_SOURCE from settings: {settings.image_caption_model_source}")

        # Load per-model API credentials (for gemini/openai per-model overrides)
        for model_type in ('text', 'image', 'image_caption'):
            prefix = model_type.upper()
            for suffix, setting_suffix in [('_API_KEY', '_api_key'), ('_API_BASE', '_api_base_url')]:
                config_key = f'{prefix}{suffix}'
                val = getattr(settings, f'{model_type}{setting_suffix}', None)
                if val:
                    app.config[config_key] = val
                    if suffix == '_API_BASE':
                        logging.info(f"Loaded {config_key} from settings: {val}")
                    else:
                        logging.info(f"Loaded {config_key} from settings")

        # Sync LazyLLM vendor API keys to environment variables
        # Only allow known vendor names to prevent environment variable injection
        from services.ai_providers.lazyllm_env import ALLOWED_LAZYLLM_VENDORS
        if settings.lazyllm_api_keys:
            import json
            try:
                keys = json.loads(settings.lazyllm_api_keys)
                for vendor, key in keys.items():
                    if key and vendor.lower() in ALLOWED_LAZYLLM_VENDORS:
                        os.environ[f"{vendor.upper()}_API_KEY"] = key
                    elif key:
                        logging.warning(f"Ignoring unknown lazyllm vendor: {vendor}")
                logging.info(f"Loaded LazyLLM API keys for vendors: {[v for v, k in keys.items() if k and v.lower() in ALLOWED_LAZYLLM_VENDORS]}")
            except (json.JSONDecodeError, TypeError):
                logging.warning("Failed to parse lazyllm_api_keys from settings")

    except Exception as e:
        if isinstance(e, SQLAlchemyError) and "no such table: settings" in str(e):
            logging.debug(f"Settings table not yet created (expected on first boot): {e}")
        else:
            logging.warning(f"Could not load settings from database: {e}")


# Create app instance
app = create_app()


def _compute_worktree_port(base_port: int) -> int:
    """Compute a deterministic port from the worktree directory name.

    Uses MD5 of the project root basename so each worktree gets a unique,
    stable port pair (backend 51xx, frontend 31xx) without manual config.
    """
    import hashlib
    basename = _project_root.name
    offset = int(hashlib.md5(basename.encode()).hexdigest()[:8], 16) % 500
    return base_port + offset


if __name__ == '__main__':
    # Run development server
    if os.getenv("IN_DOCKER", "0") == "1":
        port = 5000  # Docker 容器内部固定使用 5000 端口
    elif os.getenv('BACKEND_PORT'):
        port = int(os.getenv('BACKEND_PORT'))
    else:
        port = _compute_worktree_port(DEFAULT_BACKEND_PORT)
    debug = os.getenv('FLASK_ENV', 'development') == 'development'
    
    logging.info(
        "\n"
        "╔══════════════════════════════════════╗\n"
        "║        EasySlide API Server         ║\n"
        "╚══════════════════════════════════════╝\n"
        f"Server starting on: http://localhost:{port}\n"
        f"Output Language: {Config.OUTPUT_LANGUAGE}\n"
        f"Environment: {os.getenv('FLASK_ENV', 'development')}\n"
        f"Debug mode: {debug}\n"
        f"API Base URL: http://localhost:{port}/api\n"
        f"Database: {app.config['SQLALCHEMY_DATABASE_URI']}\n"
        f"Uploads: {app.config['UPLOAD_FOLDER']}"
    )
    
    # Using absolute paths for database, so WSL path issues should not occur
    app.run(host='0.0.0.0', port=port, debug=debug, use_reloader=debug)
