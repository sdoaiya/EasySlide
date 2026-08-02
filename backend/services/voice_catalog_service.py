"""Unified Edge + Fish voice catalog and canonical ID resolution (§7.4/阶段2).

- ``GET /api/voices`` reads Edge from a static catalog and Fish from the
  Fish Audio API (empty when no key is configured).
- ``resolve_voice_id`` accepts only canonical ``edge:<ShortName>`` /
  ``fish:<reference_id>`` IDs; ``default`` / empty / bare IDs are "not
  configured".
- ``resolve_historical_voice`` maps legacy ``default``/empty values to the
  language default and flags them as needing confirmation.
"""

import re

# Edge TTS static catalog: (short_name, gender)
_EDGE_ENTRIES: list[tuple[str, str]] = [
    # 中文
    ('zh-CN-XiaoxiaoNeural', 'female'), ('zh-CN-XiaoyiNeural', 'female'),
    ('zh-CN-YunjianNeural', 'male'), ('zh-CN-YunxiNeural', 'male'),
    ('zh-CN-YunxiaNeural', 'male'), ('zh-CN-YunyangNeural', 'male'),
    ('zh-CN-liaoning-XiaobeiNeural', 'female'), ('zh-CN-shaanxi-XiaoniNeural', 'female'),
    ('zh-TW-HsiaoChenNeural', 'female'), ('zh-TW-HsiaoYuNeural', 'female'),
    ('zh-TW-YunJheNeural', 'male'), ('zh-HK-HiuGaaiNeural', 'female'),
    ('zh-HK-HiuMaanNeural', 'female'), ('zh-HK-WanLungNeural', 'male'),
    ('wuu-CN-XiaotongNeural', 'female'), ('wuu-CN-YunzheNeural', 'male'),
    ('yue-CN-XiaoMinNeural', 'female'), ('yue-CN-YunSongNeural', 'male'),
    # 英文
    ('en-US-AriaNeural', 'female'), ('en-US-AnaNeural', 'female'),
    ('en-US-ChristopherNeural', 'male'), ('en-US-EricNeural', 'male'),
    ('en-US-GuyNeural', 'male'), ('en-US-JennyNeural', 'female'),
    ('en-US-MichelleNeural', 'female'), ('en-US-RogerNeural', 'male'),
    ('en-US-SteffanNeural', 'male'), ('en-US-AndrewNeural', 'male'),
    ('en-US-BrianNeural', 'male'), ('en-US-EmmaNeural', 'female'),
    ('en-US-AvaMultilingualNeural', 'female'), ('en-US-AndrewMultilingualNeural', 'male'),
    ('en-US-BrianMultilingualNeural', 'male'), ('en-US-EmmaMultilingualNeural', 'female'),
    ('en-US-JennyMultilingualNeural', 'female'), ('en-US-RyanMultilingualNeural', 'male'),
    ('en-GB-SoniaNeural', 'female'), ('en-GB-LibbyNeural', 'female'),
    ('en-GB-RyanNeural', 'male'), ('en-GB-ThomasNeural', 'male'),
    ('en-AU-NatashaNeural', 'female'), ('en-AU-WilliamNeural', 'male'),
    ('en-CA-ClaraNeural', 'female'), ('en-CA-LiamNeural', 'male'),
    ('en-IN-NeerjaNeural', 'female'), ('en-IN-PrabhatNeural', 'male'),
    ('en-IE-ConnorNeural', 'male'), ('en-IE-EmilyNeural', 'female'),
    # 日韩
    ('ja-JP-NanamiNeural', 'female'), ('ja-JP-KeitaNeural', 'male'),
    ('ja-JP-AoiNeural', 'female'), ('ja-JP-DaichiNeural', 'male'),
    ('ja-JP-MayuNeural', 'female'), ('ja-JP-ShioriNeural', 'female'),
    ('ja-JP-TakumiNeural', 'male'), ('ko-KR-SunHiNeural', 'female'),
    ('ko-KR-InJoonNeural', 'male'), ('ko-KR-HyunsuNeural', 'male'),
    ('ko-KR-JiMinNeural', 'female'), ('ko-KR-SeoHyeonNeural', 'female'),
    # 欧语
    ('fr-FR-DeniseNeural', 'female'), ('fr-FR-HenriNeural', 'male'),
    ('fr-FR-EliseNeural', 'female'), ('fr-FR-RemyMultilingualNeural', 'male'),
    ('de-DE-KatjaNeural', 'female'), ('de-DE-ConradNeural', 'male'),
    ('de-DE-AmalaNeural', 'female'), ('de-DE-BerndNeural', 'male'),
    ('de-DE-ChristophNeural', 'male'), ('de-DE-FlorianMultilingualNeural', 'male'),
    ('es-ES-ElviraNeural', 'female'), ('es-ES-AlvaroNeural', 'male'),
    ('es-ES-AbrilNeural', 'female'), ('es-ES-ArnauNeural', 'male'),
    ('es-ES-EliasNeural', 'male'), ('es-ES-ElenaNeural', 'female'),
    ('es-ES-LiaNeural', 'female'), ('es-MX-DaliaNeural', 'female'),
    ('es-MX-JorgeNeural', 'male'), ('es-AR-ElenaNeural', 'female'),
    ('es-CO-SalomeNeural', 'female'), ('es-CO-GonzaloNeural', 'male'),
    ('es-US-AlonsoNeural', 'male'), ('es-US-PalomaNeural', 'female'),
    ('pt-BR-FranciscaNeural', 'female'), ('pt-BR-AntonioNeural', 'male'),
    ('pt-BR-ThalitaNeural', 'female'), ('pt-PT-RaquelNeural', 'female'),
    ('pt-PT-DuarteNeural', 'male'), ('it-IT-ElsaNeural', 'female'),
    ('it-IT-IsabellaNeural', 'female'), ('it-IT-DiegoNeural', 'male'),
    ('ru-RU-SvetlanaNeural', 'female'), ('ru-RU-DmitryNeural', 'male'),
    ('tr-TR-EmelNeural', 'female'), ('tr-TR-AhmetNeural', 'male'),
    ('nl-NL-ColetteNeural', 'female'), ('nl-NL-FennaNeural', 'female'),
    ('nl-NL-MaartenNeural', 'male'), ('pl-PL-AgnieszkaNeural', 'female'),
    ('pl-PL-MarekNeural', 'male'), ('sv-SE-SofieNeural', 'female'),
    ('sv-SE-MattiasNeural', 'male'), ('da-DK-ChristelNeural', 'female'),
    ('da-DK-JeppeNeural', 'male'), ('fi-FI-SelmaNeural', 'female'),
    ('fi-FI-HarriNeural', 'male'), ('nb-NO-PernilleNeural', 'female'),
    ('nb-NO-FinnNeural', 'male'), ('cs-CZ-VlastaNeural', 'female'),
    ('cs-CZ-AntoninNeural', 'male'), ('el-GR-AthinaNeural', 'female'),
    ('el-GR-NestorasNeural', 'male'), ('hu-HU-NoemiNeural', 'female'),
    ('hu-HU-TamasNeural', 'male'), ('uk-UA-PolinaNeural', 'female'),
    ('uk-UA-OstapNeural', 'male'), ('ro-RO-AlinaNeural', 'female'),
    ('ro-RO-EmilNeural', 'male'), ('sk-SK-ViktoriaNeural', 'female'),
    ('sk-SK-LukasNeural', 'male'), ('sl-SI-PetraNeural', 'female'),
    ('sl-SI-RokNeural', 'male'), ('sr-RS-SophieNeural', 'female'),
    ('sr-RS-NicholasNeural', 'male'), ('bg-BG-KalinaNeural', 'female'),
    ('bg-BG-BorislavNeural', 'male'), ('hr-HR-GabrijelaNeural', 'female'),
    ('hr-HR-SreckoNeural', 'male'), ('is-IS-GudrunNeural', 'female'),
    ('is-IS-GunnarNeural', 'male'), ('lt-LT-OnaNeural', 'female'),
    ('lt-LT-LeonasNeural', 'male'), ('lv-LV-EveritaNeural', 'female'),
    ('lv-LV-NilsNeural', 'male'), ('mt-MT-GraceNeural', 'female'),
    ('mt-MT-JosephNeural', 'male'), ('et-EE-AnuNeural', 'female'),
    ('et-EE-KertNeural', 'male'),
    # 亚非 / 中东
    ('ar-SA-ZariyahNeural', 'female'), ('ar-SA-HamedNeural', 'male'),
    ('he-IL-HilaNeural', 'female'), ('he-IL-AvriNeural', 'male'),
    ('fa-IR-DilaraNeural', 'female'), ('fa-IR-FaridNeural', 'male'),
    ('hi-IN-SwaraNeural', 'female'), ('hi-IN-MadhurNeural', 'male'),
    ('mr-IN-AarohiNeural', 'female'), ('mr-IN-ManoharNeural', 'male'),
    ('ta-IN-PallaviNeural', 'female'), ('ta-IN-ValluvarNeural', 'male'),
    ('te-IN-ShrutiNeural', 'female'), ('te-IN-MohanNeural', 'male'),
    ('kn-IN-SapnaNeural', 'female'), ('kn-IN-GaganNeural', 'male'),
    ('ml-IN-SobhanaNeural', 'female'), ('ml-IN-MidhunNeural', 'male'),
    ('gu-IN-DhwaniNeural', 'female'), ('gu-IN-NiranjanNeural', 'male'),
    ('bn-BD-NabanitaNeural', 'female'), ('bn-BD-PradeepNeural', 'male'),
    ('pa-IN-OjasNeural', 'female'), ('pa-IN-EnakshiNeural', 'male'),
    ('ur-IN-GulNeural', 'female'), ('ur-IN-SalmanNeural', 'male'),
    ('ur-PK-UzmaNeural', 'female'), ('ur-PK-AsadNeural', 'male'),
    ('vi-VN-HoaiMyNeural', 'female'), ('vi-VN-NamMinhNeural', 'male'),
    ('th-TH-PremwadeeNeural', 'female'), ('th-TH-NiwatNeural', 'male'),
    ('id-ID-GadisNeural', 'female'), ('id-ID-ArdiNeural', 'male'),
    ('ms-MY-YasminNeural', 'female'), ('ms-MY-OsmanNeural', 'male'),
    ('fil-PH-BlessicaNeural', 'female'), ('fil-PH-AngeloNeural', 'male'),
    ('sw-KE-ZuriNeural', 'female'), ('sw-KE-RafikiNeural', 'male'),
    ('af-ZA-AdriNeural', 'female'), ('af-ZA-WillemNeural', 'male'),
    ('am-ET-MekdesNeural', 'female'), ('am-ET-AkliluNeural', 'male'),
    ('ca-ES-JoanaNeural', 'female'), ('ca-ES-EnricNeural', 'male'),
    ('km-KH-SreymomNeural', 'female'), ('km-KH-PisethNeural', 'male'),
    ('lo-LA-KeomanaNeural', 'female'), ('lo-LA-ChanthavongNeural', 'male'),
    ('ne-NP-HemkalaNeural', 'female'), ('ne-NP-SagarNeural', 'male'),
    ('or-IN-SubhasiniNeural', 'female'), ('or-IN-SukantNeural', 'male'),
    ('si-LK-ThiliniNeural', 'female'), ('si-LK-SameeraNeural', 'male'),
    ('uz-UZ-MadinaNeural', 'female'), ('uz-UZ-SardorNeural', 'male'),
    ('kk-KZ-AigulNeural', 'female'), ('kk-KZ-DauletNeural', 'male'),
    ('jv-ID-SitiNeural', 'female'), ('jv-ID-DimasNeural', 'male'),
]

# Canonical expressiveness profiles every Edge voice supports.
EXPRESSIVENESS_IDS = [
    'expression.standard.v1',
    'expression.warm.v1',
    'expression.energetic.v1',
    'expression.soft.v1',
]

DEFAULT_EXPRESSIVENESS_ID = 'expression.standard.v1'

# Language default voices for historical `default`/empty resolution.
DEFAULT_VOICE_BY_LANGUAGE = {
    'zh': 'edge:zh-CN-XiaoxiaoNeural',
    'en': 'edge:en-US-AriaNeural',
    'ja': 'edge:ja-JP-NanamiNeural',
    'ko': 'edge:ko-KR-SunHiNeural',
    'fr': 'edge:fr-FR-DeniseNeural',
    'de': 'edge:de-DE-KatjaNeural',
    'es': 'edge:es-ES-ElviraNeural',
    'pt': 'edge:pt-BR-FranciscaNeural',
    'it': 'edge:it-IT-ElsaNeural',
    'ru': 'edge:ru-RU-SvetlanaNeural',
    'ar': 'edge:ar-SA-ZariyahNeural',
    'hi': 'edge:hi-IN-SwaraNeural',
    'vi': 'edge:vi-VN-HoaiMyNeural',
    'th': 'edge:th-TH-PremwadeeNeural',
    'id': 'edge:id-ID-GadisNeural',
}

_EDGE_BY_SHORT_NAME: dict[str, dict] = {}


def _locale_of(short_name: str) -> str:
    parts = short_name.split('-')
    return '-'.join(parts[:2])


def _display_name(short_name: str) -> str:
    # zh-CN-XiaoxiaoNeural → Xiaoxiao (zh-CN)
    parts = short_name.split('-')
    name = parts[-1].removesuffix('Neural') if parts else short_name
    return f'{name} ({_locale_of(short_name)})'


def _edge_catalog() -> list[dict]:
    if _EDGE_BY_SHORT_NAME:
        return list(_EDGE_BY_SHORT_NAME.values())
    for short_name, gender in _EDGE_ENTRIES:
        _EDGE_BY_SHORT_NAME[short_name] = {
            'voice_id': f'edge:{short_name}',
            'provider': 'edge',
            'upstream_id': short_name,
            'name': _display_name(short_name),
            'gender': gender,
            'locale': _locale_of(short_name),
            'languages': [_locale_of(short_name)],
            'supported_expressiveness_ids': list(EXPRESSIVENESS_IDS),
        }
    return list(_EDGE_BY_SHORT_NAME.values())


def get_voice_catalog(provider: str | None = None, language: str | None = None,
                      query: str | None = None) -> list[dict]:
    """Unified read-only catalog; Fish items come from the live API when keyed."""
    voices: list[dict] = []
    if not provider or provider == 'edge':
        voices.extend(_edge_catalog())
    if not provider or provider in {'fish', 'fish_audio'}:
        voices.extend(_fish_catalog())
    if language:
        lang = language.lower().split('-')[0]
        voices = [
            item for item in voices
            if any(str(loc).lower().split('-')[0] == lang for loc in item.get('languages') or [])
        ]
    if query:
        q = query.strip().lower()
        if q:
            voices = [
                item for item in voices
                if q in str(item.get('upstream_id') or '').lower()
                or q in str(item.get('name') or '').lower()
                or q in str(item.get('voice_id') or '').lower()
            ]
    return voices


def _fish_catalog() -> list[dict]:
    """Fish voices from the configured API key; empty when unavailable."""
    try:
        from flask import current_app

        from services.fish_audio_service import FishAudioAPIError, list_voices
        key = str(current_app.config.get('FISH_AUDIO_API_KEY') or '').strip()
        if not key:
            return []
        items = list_voices(key, scope='all')
    except (FishAudioAPIError, RuntimeError, KeyError):
        return []
    except Exception:
        return []
    voices = []
    for item in items:
        reference_id = str(item.get('id') or '').strip()
        if not reference_id:
            continue
        languages = item.get('languages') if isinstance(item.get('languages'), list) else []
        voices.append({
            'voice_id': f'fish:{reference_id}',
            'provider': 'fish_audio',
            'upstream_id': reference_id,
            'name': str(item.get('title') or reference_id),
            'gender': None,
            'locale': '',
            'languages': languages or [],
            'supported_expressiveness_ids': list(EXPRESSIVENESS_IDS),
        })
    return voices


_FISH_ID_RE = re.compile(r'^[A-Za-z0-9_-]{8,128}$')


def resolve_voice_id(raw) -> str | None:
    """Canonical ID resolution; ``default``/empty/bare IDs are not configured."""
    _edge_catalog()  # 确保惰性目录已初始化
    if raw is None:
        return None
    value = str(raw).strip()
    if not value or value.lower() == 'default':
        return None
    if value.startswith('edge:'):
        short_name = value[len('edge:'):]
        return value if short_name in _EDGE_BY_SHORT_NAME else None
    if value.startswith('fish:'):
        reference_id = value[len('fish:'):]
        return value if _FISH_ID_RE.fullmatch(reference_id) else None
    return None


def resolve_historical_voice(raw, language: str = 'zh') -> tuple[str, bool]:
    """Map legacy values to a concrete voice.

    Returns ``(canonical_id, needs_confirmation)``. Valid canonical IDs pass
    through unchanged; ``default``/empty/None resolve to the language default
    and are flagged as needing confirmation.
    """
    canonical = resolve_voice_id(raw)
    if canonical:
        return canonical, False
    lang = (language or 'zh').lower().split('-')[0]
    return DEFAULT_VOICE_BY_LANGUAGE.get(lang, DEFAULT_VOICE_BY_LANGUAGE['zh']), True


def get_voice_detail(voice_id: str) -> dict | None:
    """Return one catalog item by canonical voice id, or None."""
    for item in get_voice_catalog():
        if item['voice_id'] == voice_id:
            return item
    return None
