from app import create_app
from models import Settings
app = create_app()
with app.app_context():
    settings = Settings.get_settings()
    print('FISH_AUDIO_CONFIGURED=' + str(bool(settings.fish_audio_api_key or app.config.get('FISH_AUDIO_API_KEY'))))
    print('FISH_VOICE_ASSET_COUNT=' + str(len(settings.get_fish_audio_voice_assets())))
