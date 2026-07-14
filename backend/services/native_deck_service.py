"""Validation and lookup for the native slide layout contract."""

import json
import sys
from copy import deepcopy
from pathlib import Path


_root = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parents[2]))
DEFAULT_MANIFEST = _root / 'shared' / 'native-deck' / 'layout-manifest.json'
NATIVE_METADATA_FIELDS = {'__media_prompts', '__unmapped_content'}


class NativeDeckService:
    def __init__(self, manifest_path=None):
        manifest = json.loads(Path(manifest_path or DEFAULT_MANIFEST).read_text(encoding='utf-8'))
        layouts = manifest.get('layouts', [])
        self._layouts = {item['layout']: item for item in layouts}
        if len(self._layouts) != len(layouts):
            raise ValueError('布局 ID 不能重复')

    def list_layouts(self, role=None, needs_media=None, theme=None):
        layouts = list(self._layouts.values())
        if theme:
            layouts = [item for item in layouts if item['theme'] == theme]
        if role:
            if role == 'content':
                layouts = [item for item in layouts if 'cover' not in item['roles']]
            elif role == 'end':
                layouts = [item for item in layouts if 'end' in item['roles'] or 'closing' in item['roles']]
            else:
                layouts = [item for item in layouts if role in item['roles']]
        if needs_media is not None:
            layouts = [item for item in layouts if bool(item['mediaSlots']) is needs_media]
        return layouts

    def validate_props(self, layout, props):
        contract = self._get_layout(layout)
        if not isinstance(props, dict):
            raise ValueError('页面属性必须是对象')

        controls = {item.get('publicKey') or item['key']: item for item in contract.get('controls', [])}
        unknown = set(props) - set(contract['propShapes']) - set(controls) - NATIVE_METADATA_FIELDS
        if unknown:
            raise ValueError(f"未知字段: {', '.join(sorted(unknown))}")

        for key, value in props.items():
            if value is None:
                continue
            if key in NATIVE_METADATA_FIELDS:
                self._validate_metadata(key, value)
                continue
            if key in contract['propShapes']:
                self._validate_shape(key, value, contract['propShapes'][key], contract)
            else:
                self._validate_control(key, value, controls[key])

        for path, budget in contract.get('copyBudgets', {}).items():
            for value in self._path_values(props, path):
                if isinstance(value, str) and len(value) > budget['maxChars']:
                    raise ValueError(f'{path} 超出 {budget["maxChars"]} 字限制')
        return True

    @staticmethod
    def _validate_metadata(key, value):
        if not isinstance(value, dict):
            raise ValueError(f'{key} 必须是对象')
        if key == '__media_prompts' and any(not isinstance(item_key, str) or not isinstance(item_value, str) for item_key, item_value in value.items()):
            raise ValueError('__media_prompts 必须使用文本键值')
        if len(json.dumps(value, ensure_ascii=False)) > 100_000:
            raise ValueError(f'{key} 内容过大')

    def normalize_slide(self, layout, props):
        self.validate_props(layout, props)
        contract = self._get_layout(layout)
        normalized = {}
        for key, value in props.items():
            if value is None:
                normalized[key] = self._blank_value(contract['propShapes'].get(key))
            else:
                normalized[key] = value
        return {'layout': layout, 'theme': contract['theme'], 'props': normalized}

    def fit_copy_budgets(self, layout, props):
        """Trim model-generated copy to the selected layout's hard limits."""
        fitted = deepcopy(props)
        for path, budget in self._get_layout(layout).get('copyBudgets', {}).items():
            self._trim_path(fitted, path.split('.'), budget['maxChars'])
        return fitted

    def _get_layout(self, layout):
        try:
            return self._layouts[layout]
        except KeyError as exc:
            raise ValueError(f'未知布局: {layout}') from exc

    def _validate_shape(self, key, value, shape, contract):
        if shape == 'string' and not isinstance(value, str):
            raise ValueError(f'{key} 必须是文本')
        if shape == 'number' and (isinstance(value, bool) or not isinstance(value, (int, float))):
            raise ValueError(f'{key} 必须是数字')
        if shape == 'boolean' and not isinstance(value, bool):
            raise ValueError(f'{key} 必须是布尔值')
        if shape == 'media' and (not isinstance(value, str) or not value.startswith(('/files/', 'data:', 'assets/'))):
            raise ValueError(f'{key} 必须使用项目素材路径')
        if shape == 'string[]':
            shape = ['string']
        if isinstance(shape, list):
            if not isinstance(value, list):
                raise ValueError(f'{key} 必须是数组')
            meta = next((item for item in contract.get('arrayMeta', []) if item['key'] == key), None)
            legacy = contract.get('arrayLimits', {}).get(key)
            minimum = (meta or {}).get('min') if meta else (legacy or {}).get('min')
            maximum = (meta or {}).get('max') if meta else (legacy or {}).get('max')
            if minimum is not None and len(value) < minimum or maximum is not None and len(value) > maximum:
                raise ValueError(f'{key} 数量不符合布局要求')
            for index, item in enumerate(value):
                item_shape = shape[index] if len(shape) > 1 and index < len(shape) else shape[0] if shape else 'string'
                self._validate_shape(f'{key}[{index}]', item, item_shape, contract)
        if isinstance(shape, dict):
            if not isinstance(value, dict):
                raise ValueError(f'{key} 必须是对象')
            unknown = set(value) - set(shape)
            if unknown:
                raise ValueError(f'{key} 包含未知字段: {", ".join(sorted(unknown))}')
            for child_key, child_value in value.items():
                self._validate_shape(f'{key}.{child_key}', child_value, shape[child_key], contract)

    @staticmethod
    def _validate_control(key, value, control):
        control_type = control.get('type')
        if control_type == 'toggle' and not isinstance(value, bool):
            raise ValueError(f'{key} 必须是布尔值')
        if control_type in {'range', 'number'}:
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f'{key} 必须是数字')
            if control.get('min') is not None and value < control['min'] or control.get('max') is not None and value > control['max']:
                raise ValueError(f'{key} 超出允许范围')

    @staticmethod
    def _path_values(props, path):
        values = [props]
        for segment in path.split('.'):
            is_array = segment.endswith('[]')
            key = segment[:-2] if is_array else segment
            next_values = []
            for value in values:
                if not isinstance(value, dict) or key not in value:
                    continue
                child = value[key]
                if is_array and isinstance(child, list):
                    next_values.extend(child)
                elif not is_array:
                    next_values.append(child)
            values = next_values
        return values

    @classmethod
    def _trim_path(cls, value, segments, maximum):
        if not segments or not isinstance(value, dict):
            return
        segment, *rest = segments
        is_array = segment.endswith('[]')
        key = segment[:-2] if is_array else segment
        child = value.get(key)
        if is_array:
            if isinstance(child, list):
                if rest:
                    for item in child:
                        cls._trim_path(item, rest, maximum)
                else:
                    value[key] = [item[:maximum] if isinstance(item, str) else item for item in child]
        elif rest:
            cls._trim_path(child, rest, maximum)
        elif isinstance(child, str):
            value[key] = child[:maximum]

    @classmethod
    def _blank_value(cls, shape):
        if shape is None or shape in ('string', 'media'):
            return ''
        if shape == 'number':
            return 0
        if shape == 'boolean':
            return False
        if shape == 'string[]' or isinstance(shape, list):
            return []
        if isinstance(shape, dict):
            return {key: cls._blank_value(value) for key, value in shape.items()}
        return ''
