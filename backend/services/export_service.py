"""
Export Service - handles PPTX and PDF export
Based on demo.py create_pptx_from_images()
"""
import math
import os
import json
import logging
import random
import re
import tempfile
import base64
import hashlib
import time
from concurrent.futures import TimeoutError
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from zipfile import BadZipFile, ZipFile, is_zipfile
from textwrap import dedent
from dataclasses import dataclass, field
from pptx import Presentation
from pptx.util import Inches
from pptx.oxml.xmlchemy import OxmlElement
from pptx.oxml.ns import qn
from PIL import Image, ImageDraw
import io
import tempfile
import img2pdf
import fitz  # PyMuPDF
from branding import EXPORT_CREATOR
from utils.pptx_math import latex_to_display_text, looks_like_latex_math
logger = logging.getLogger(__name__)


class ExportError(Exception):
    """
    导出过程中的错误异常

    当 fail_fast=True 时，任何导出错误都会抛出此异常，
    包含详细的错误信息和帮助提示。
    """
    def __init__(self, message: str, error_type: str = 'unknown', details: Dict[str, Any] = None, help_text: str = None):
        """
        Args:
            message: 错误消息
            error_type: 错误类型 (style_extraction, text_render, image_add, inpaint, config, service)
            details: 详细错误信息
            help_text: 帮助提示文本
        """
        super().__init__(message)
        self.message = message
        self.error_type = error_type
        self.details = details or {}
        self.help_text = help_text or self._get_default_help_text(error_type)

    def _get_default_help_text(self, error_type: str) -> str:
        """根据错误类型返回默认帮助提示"""
        help_texts = {
            'style_extraction': '样式提取失败可能是由于百度OCR API配置问题。请检查「项目设置 -> 导出设置」中的配置，或尝试切换到「MinerU提取」方法。',
            'layout_analysis': '版面元素识别后仍可能卡在背景修复或递归子图分析阶段。请检查背景修复配置；系统会尽量跳过背景修复继续导出可编辑PPTX。',
            'text_render': '文本渲染失败可能是由于字体或编码问题。请检查页面内容是否包含特殊字符。',
            'image_add': '图片添加失败可能是由于图片文件损坏或路径错误。请尝试重新生成该页面的图片。',
            'inpaint': '背景修复失败可能是由于API配置问题。请检查「项目设置 -> 导出设置」中的背景图获取方法配置。',
            'config': '配置错误。请检查「项目设置 -> 导出设置」中的相关配置。',
            'service': '服务不可用。请稍后重试或联系管理员。',
        }
        return help_texts.get(error_type, '如果问题持续出现，可以在「项目设置 -> 导出设置」中开启「返回半成品」选项以跳过错误继续导出。')

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        return {
            'message': self.message,
            'error_type': self.error_type,
            'details': self.details,
            'help_text': self.help_text
        }


@dataclass
class ExportWarnings:
    """
    导出过程中收集的警告信息
    
    用于追踪哪些操作没有按预期执行，并反馈给前端
    """
    # 样式提取失败的元素
    style_extraction_failed: List[Dict[str, Any]] = field(default_factory=list)
    
    # 文本渲染失败的元素
    text_render_failed: List[Dict[str, Any]] = field(default_factory=list)
    
    # 图片添加失败
    image_add_failed: List[Dict[str, Any]] = field(default_factory=list)
    
    # JSON 解析失败（重试后仍失败）
    json_parse_failed: List[Dict[str, Any]] = field(default_factory=list)
    
    # 其他警告
    other_warnings: List[str] = field(default_factory=list)

    # 可编辑 PPTX 重建证据目录（manifest.json / validation.json）
    rebuild_artifacts_dir: Optional[str] = None
    
    def add_style_extraction_failed(self, element_id: str, reason: str):
        """记录样式提取失败"""
        self.style_extraction_failed.append({
            'element_id': element_id,
            'reason': reason
        })
    
    def add_text_render_failed(self, text: str, reason: str):
        """记录文本渲染失败"""
        self.text_render_failed.append({
            'text': text[:50] + '...' if len(text) > 50 else text,
            'reason': reason
        })
    
    def add_image_failed(self, path: str, reason: str):
        """记录图片添加失败"""
        self.image_add_failed.append({
            'path': path,
            'reason': reason
        })
    
    def add_json_parse_failed(self, context: str, reason: str):
        """记录 JSON 解析失败"""
        self.json_parse_failed.append({
            'context': context,
            'reason': reason
        })
    
    def add_warning(self, message: str):
        """添加其他警告"""
        self.other_warnings.append(message)
    
    def has_warnings(self) -> bool:
        """是否有警告"""
        return bool(
            self.style_extraction_failed or 
            self.text_render_failed or 
            self.image_add_failed or
            self.json_parse_failed or
            self.other_warnings
        )
    
    def to_summary(self) -> List[str]:
        """生成警告摘要（适合前端展示）"""
        summary = []
        
        if self.style_extraction_failed:
            summary.append(f"⚠️ {len(self.style_extraction_failed)} 个文本元素样式提取失败")
        
        if self.text_render_failed:
            summary.append(f"⚠️ {len(self.text_render_failed)} 个文本元素渲染失败")
        
        if self.image_add_failed:
            summary.append(f"⚠️ {len(self.image_add_failed)} 张图片添加失败")
        
        if self.json_parse_failed:
            summary.append(f"⚠️ {len(self.json_parse_failed)} 次 AI 响应解析失败")
        
        for warning in self.other_warnings[:5]:  # 最多显示5条其他警告
            summary.append(f"⚠️ {warning}")
        
        if len(self.other_warnings) > 5:
            summary.append(f"  ...还有 {len(self.other_warnings) - 5} 条其他警告")
        
        return summary
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典（详细信息）"""
        return {
            'style_extraction_failed': self.style_extraction_failed,
            'text_render_failed': self.text_render_failed,
            'image_add_failed': self.image_add_failed,
            'json_parse_failed': self.json_parse_failed,
            'other_warnings': self.other_warnings,
            'rebuild_artifacts_dir': self.rebuild_artifacts_dir,
            'total_warnings': (
                len(self.style_extraction_failed) +
                len(self.text_render_failed) +
                len(self.image_add_failed) +
                len(self.json_parse_failed) +
                len(self.other_warnings)
            )
        }


def _get_page_size_inches(aspect_ratio: str = '16:9', base: float = 10.0) -> Tuple[float, float]:
    """Return (width, height) in inches for a given aspect ratio string."""
    try:
        w, h = (float(x) for x in aspect_ratio.split(':'))
        if not (math.isfinite(w) and math.isfinite(h) and w > 0 and h > 0):
            raise ValueError(f"invalid dimensions: {w}:{h}")
    except (ValueError, AttributeError) as e:
        logger.warning(f"Invalid aspect ratio '{aspect_ratio}', falling back to 16:9: {e}")
        w, h = 16.0, 9.0
    if w >= h:
        return base, base * h / w
    else:
        return base * w / h, base


class ExportService:
    """Service for exporting presentations"""

    PPTX_TRANSITION_EFFECTS = {
        'fade',
        'page_turn',
        'push',
        'wipe',
        'split',
        'blinds',
        'checker',
        'wheel',
    }

    @staticmethod
    def _apply_slide_transition(slide, effect: str) -> None:
        """Add a PowerPoint slide transition node to a slide XML element."""
        transition = OxmlElement('p:transition')
        transition.set('spd', 'med')

        if effect == 'fade':
            transition.append(OxmlElement('p:fade'))
        elif effect == 'page_turn':
            cover = OxmlElement('p:cover')
            cover.set('dir', 'l')
            transition.append(cover)
        elif effect == 'push':
            push = OxmlElement('p:push')
            push.set('dir', 'l')
            transition.append(push)
        elif effect == 'wipe':
            wipe = OxmlElement('p:wipe')
            wipe.set('dir', 'l')
            transition.append(wipe)
        elif effect == 'split':
            split = OxmlElement('p:split')
            split.set('orient', 'horz')
            split.set('dir', 'out')
            transition.append(split)
        elif effect == 'blinds':
            blinds = OxmlElement('p:blinds')
            blinds.set('dir', 'vert')
            transition.append(blinds)
        elif effect == 'checker':
            checker = OxmlElement('p:checker')
            checker.set('dir', 'horz')
            transition.append(checker)
        elif effect == 'wheel':
            wheel = OxmlElement('p:wheel')
            wheel.set('spokes', '1')
            transition.append(wheel)
        else:
            return

        slide_element = slide._element
        existing = slide_element.find(qn('p:transition'))
        if existing is not None:
            slide_element.remove(existing)

        clr_map_ovr = slide_element.find(qn('p:clrMapOvr'))
        if clr_map_ovr is not None:
            insert_at = slide_element.index(clr_map_ovr) + 1
        else:
            c_sld = slide_element.find(qn('p:cSld'))
            insert_at = slide_element.index(c_sld) + 1 if c_sld is not None else 0

        slide_element.insert(insert_at, transition)

    # NOTE: clean background生成功能已迁移到解耦的InpaintProvider实现
    # - DefaultInpaintProvider: 基于mask的精确区域重绘（Volcengine）
    # - GenerativeEditInpaintProvider: 基于生成式大模型的整图编辑重绘（Gemini等）
    # 使用方式: from services.image_editability import InpaintProviderFactory

    @staticmethod
    def _build_style_extraction_error(
        message: str,
        *,
        element_id: Optional[str] = None,
        text_content: Optional[str] = None,
        page_idx: Optional[int] = None
    ) -> ExportError:
        details: Dict[str, Any] = {}
        if element_id:
            details['element_id'] = element_id
        if text_content:
            details['text_content'] = text_content[:50]
        if page_idx is not None:
            details['page'] = page_idx + 1

        lowered = message.lower()
        if '不支持图片输入' in message or 'support image input' in lowered:
            help_text = (
                '当前用于图片样式提取的 caption/image_caption 模型不支持图片输入。'
                '请在设置中改成支持视觉输入的模型，或检查 OpenAI 格式下的 image caption provider / model 配置。'
            )
        elif (
            'ssl' in lowered
            or 'unexpected_eof_while_reading' in lowered
            or 'eof occurred in violation of protocol' in lowered
            or 'max retries exceeded' in lowered
            or 'connection aborted' in lowered
            or 'connection reset' in lowered
        ) and ('codex' in lowered or 'chatgpt' in lowered):
            help_text = (
                '连接 Codex 服务时网络中断，导致文本样式提取失败。'
                '请稍后重试；如果反复出现，可重新连接 Codex/OpenAI 后再试。'
                '若只想先拿到可编辑结果，也可以在「项目设置 -> 导出设置」中开启「返回半成品」。'
            )
        else:
            help_text = (
                '文本样式提取依赖视觉模型分析文本截图。请检查 image caption provider、模型名与 API 权限；'
                '如果只想先拿到可编辑结果，也可以在「项目设置 -> 导出设置」中开启「返回半成品」。'
            )

        return ExportError(
            message=f"文本样式提取失败: {message}",
            error_type='style_extraction',
            details=details,
            help_text=help_text,
        )
    
    @staticmethod
    def create_pptx_from_images(
        image_paths: List[str],
        output_file: str = None,
        aspect_ratio: str = '16:9',
        transition_effects: Optional[List[str]] = None,
    ) -> bytes:
        """
        Create PPTX file from image paths
        Based on demo.py create_pptx_from_images()
        
        Args:
            image_paths: List of absolute paths to images
            output_file: Optional output file path (if None, returns bytes)
        
        Returns:
            PPTX file as bytes if output_file is None
        """
        # Create presentation
        prs = Presentation()
        
        # Set author/date metadata for exported PPTX
        try:
            core = prs.core_properties
            now = datetime.now(timezone.utc)
            core.author = EXPORT_CREATOR
            core.last_modified_by = EXPORT_CREATOR
            core.created = now
            core.modified = now
        except Exception as e:
            logger.warning(f"Failed to set core properties: {e}")
        
        # Set slide dimensions based on aspect ratio
        page_w, page_h = _get_page_size_inches(aspect_ratio)
        prs.slide_width = Inches(page_w)
        prs.slide_height = Inches(page_h)
        
        valid_transition_effects = [
            effect for effect in (transition_effects or [])
            if effect in ExportService.PPTX_TRANSITION_EFFECTS
        ]
        transition_effect_queue: List[str] = []

        # Add each image as a slide
        for image_path in image_paths:
            if not os.path.exists(image_path):
                logger.warning(f"Image not found: {image_path}")
                continue
            
            # Add blank slide layout (layout 6 is typically blank)
            blank_slide_layout = prs.slide_layouts[6]
            slide = prs.slides.add_slide(blank_slide_layout)
            
            # Add image to fill entire slide
            slide.shapes.add_picture(
                image_path,
                left=0,
                top=0,
                width=prs.slide_width,
                height=prs.slide_height
            )

            if valid_transition_effects:
                if not transition_effect_queue:
                    transition_effect_queue = valid_transition_effects[:]
                    random.shuffle(transition_effect_queue)
                ExportService._apply_slide_transition(
                    slide,
                    transition_effect_queue.pop(),
                )
        
        # Save or return bytes
        if output_file:
            prs.save(output_file)
            return None
        else:
            # Save to bytes
            pptx_bytes = io.BytesIO()
            prs.save(pptx_bytes)
            pptx_bytes.seek(0)
            return pptx_bytes.getvalue()
    
    @staticmethod
    def create_pdf_from_images(image_paths: List[str], output_file: str = None, aspect_ratio: str = '16:9') -> Optional[bytes]:
        """
        Create PDF file from image paths using img2pdf (low memory usage)

        Args:
            image_paths: List of absolute paths to images
            output_file: Optional output file path (if None, returns bytes)

        Returns:
            PDF file as bytes if output_file is None, otherwise None
        """
        # Validate images exist and log warnings for missing files
        valid_paths = []
        for p in image_paths:
            if os.path.exists(p):
                valid_paths.append(p)
            else:
                logger.warning(f"Image not found and will be skipped for PDF export: {p}")

        if not valid_paths:
            raise ValueError("No valid images found for PDF export")

        try:
            logger.info(f"Using img2pdf for PDF export ({len(valid_paths)} pages, low memory mode)")

            page_w, page_h = _get_page_size_inches(aspect_ratio)
            layout_fun = img2pdf.get_layout_fun(
                pagesize=(img2pdf.in_to_pt(page_w), img2pdf.in_to_pt(page_h)),
                fit=img2pdf.FitMode.fill,
            )

            # Convert images to PDF
            pdf_bytes = img2pdf.convert(valid_paths, layout_fun=layout_fun)

            # Add metadata
            pdf_bytes = ExportService._add_pdf_metadata(pdf_bytes)

            if output_file:
                with open(output_file, "wb") as f:
                    f.write(pdf_bytes)
                return None
            else:
                return pdf_bytes
        except (img2pdf.ImageOpenError, ValueError, IOError) as e:
            logger.warning(f"img2pdf conversion failed: {e}. Falling back to Pillow (high memory usage).")
            return ExportService.create_pdf_from_images_pillow(valid_paths, output_file, aspect_ratio)

    @staticmethod
    def _add_pdf_metadata(pdf_bytes: bytes) -> bytes:
        """Add author metadata to PDF (including XMP for Windows compatibility)"""
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")

            doc.set_metadata({
                "author": EXPORT_CREATOR,
                "producer": EXPORT_CREATOR,
                "creator": EXPORT_CREATOR
            })

            now = datetime.now(timezone.utc)
            iso_time = now.isoformat()

            content_hash = hashlib.md5(pdf_bytes[:1024]).hexdigest()

            xmp = dedent(f'''\
                <?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
                <x:xmpmeta xmlns:x="adobe:ns:meta/">
                  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
                    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
                      <dc:creator><rdf:Seq><rdf:li>{EXPORT_CREATOR}</rdf:li></rdf:Seq></dc:creator>
                    </rdf:Description>
                    <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
                      <pdf:Producer>{EXPORT_CREATOR}</pdf:Producer>
                    </rdf:Description>
                    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
                      <xmp:CreatorTool>{EXPORT_CREATOR}</xmp:CreatorTool>
                      <xmp:CreateDate>{iso_time}</xmp:CreateDate>
                      <xmp:MetadataDate>{iso_time}</xmp:MetadataDate>
                    </rdf:Description>
                    <rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/">
                      <xmpMM:DocumentID>uuid:{content_hash}</xmpMM:DocumentID>
                    </rdf:Description>
                  </rdf:RDF>
                </x:xmpmeta>
                <?xpacket end="w"?>''')
            doc.set_xml_metadata(xmp)

            return doc.tobytes()
        except Exception as e:
            logger.warning(f"Failed to add PDF metadata: {e}")
            return pdf_bytes

    @staticmethod
    def create_pdf_from_images_pillow(image_paths: List[str], output_file: str = None, aspect_ratio: str = '16:9') -> Optional[bytes]:
        """
        Create PDF file from image paths using Pillow (original method)

        Note: This method loads all images into memory at once.
        For large projects (50+ pages with 20MB/page), use create_pdf_from_images instead.

        Args:
            image_paths: List of absolute paths to images
            output_file: Optional output file path (if None, returns bytes)

        Returns:
            PDF file as bytes if output_file is None, otherwise None
        """
        images = []
        page_w, page_h = _get_page_size_inches(aspect_ratio)

        # Load all images
        for image_path in image_paths:
            if not os.path.exists(image_path):
                logger.warning(f"Image not found: {image_path}")
                continue

            img = Image.open(image_path)

            # Convert to RGB if necessary (PDF requires RGB)
            if img.mode != 'RGB':
                img = img.convert('RGB')

            # Set DPI so PDF page matches target dimensions
            img.info['dpi'] = (img.width / page_w, img.height / page_h)

            images.append(img)

        if not images:
            raise ValueError("No valid images found for PDF export")

        # Save as PDF
        if output_file:
            images[0].save(
                output_file,
                save_all=True,
                append_images=images[1:],
                format='PDF'
            )
            return None
        else:
            # Save to bytes
            pdf_bytes = io.BytesIO()
            images[0].save(
                pdf_bytes,
                save_all=True,
                append_images=images[1:],
                format='PDF'
            )
            pdf_bytes.seek(0)
            return ExportService._add_pdf_metadata(pdf_bytes.getvalue())
       
    @staticmethod
    def _add_mineru_text_to_slide(builder, slide, text_item: Dict[str, Any], scale_x: float = 1.0, scale_y: float = 1.0):
        """
        Add text item from MinerU to slide
        
        Args:
            builder: PPTXBuilder instance
            slide: Target slide
            text_item: Text item from MinerU content_list
            scale_x: X-axis scale factor
            scale_y: Y-axis scale factor
        """
        text = text_item.get('text', '').strip()
        if not text:
            return
        
        bbox = text_item.get('bbox')
        if not bbox or len(bbox) != 4:
            logger.warning(f"Invalid bbox for text item: {text_item}")
            return
        
        original_bbox = bbox.copy()
        
        # Apply scale factors to bbox
        x0, y0, x1, y1 = bbox
        bbox = [
            int(x0 * scale_x),
            int(y0 * scale_y),
            int(x1 * scale_x),
            int(y1 * scale_y)
        ]
        
        if scale_x != 1.0 or scale_y != 1.0:
            logger.debug(f"Text bbox scaled: {original_bbox} -> {bbox} (scale: {scale_x:.3f}x{scale_y:.3f})")
        
        # Determine text level (only used for styling like bold, NOT for font size)
        # Font size is purely calculated from bbox dimensions
        item_type = text_item.get('type', 'text')
        text_level = text_item.get('text_level')
        
        # Map to level for styling purposes (bold titles)
        if item_type == 'title' or text_level == 1:
            level = 'title'  # Will be bold
        else:
            level = 'default'
        
        # Add text element
        # Note: text_level is only used for bold styling, not font size calculation
        try:
            builder.add_text_element(
                slide=slide,
                text=text,
                bbox=bbox,
                text_level=level  # For styling (bold) only, not font size
            )
        except Exception as e:
            logger.error(f"Failed to add text element: {str(e)}")
    
    @staticmethod
    def _add_table_cell_elements_to_slide(
        builder,
        slide,
        cell_elements: List[Dict[str, Any]],
        scale_x: float = 1.0,
        scale_y: float = 1.0
    ):
        """
        Add table cell elements as individual text boxes to slide
        这些单元格元素已经有正确的全局bbox坐标
        
        Args:
            builder: PPTXBuilder instance
            slide: Target slide
            cell_elements: List of EditableElement (table_cell type)
            scale_x: X-axis scale factor
            scale_y: Y-axis scale factor
        """
        from pptx.util import Pt
        from pptx.dml.color import RGBColor
        
        logger.info(f"开始添加表格单元格元素，共 {len(cell_elements)} 个")
        
        for cell_elem in cell_elements:
            text = cell_elem.get('content', '')
            bbox_global = cell_elem.get('bbox_global', {})
            
            if not text.strip():
                continue
            
            # bbox_global已经是全局坐标，直接使用并应用缩放
            x0 = bbox_global.get('x0', 0)
            y0 = bbox_global.get('y0', 0)
            x1 = bbox_global.get('x1', 0)
            y1 = bbox_global.get('y1', 0)
            
            # 构建bbox列表 [x0, y0, x1, y1] 并应用缩放
            bbox = [
                int(x0 * scale_x),
                int(y0 * scale_y),
                int(x1 * scale_x),
                int(y1 * scale_y)
            ]
            
            try:
                # 使用已有的 add_text_element 方法添加文本框（不添加边框）
                builder.add_text_element(
                    slide=slide,
                    text=text,
                    bbox=bbox,
                    text_level=None,
                    align='center'
                )
                
                logger.debug(f"  添加单元格: '{text[:10]}...' at bbox {bbox}")
                
            except Exception as e:
                logger.warning(f"添加单元格失败: {e}")
        
        logger.info(f"✓ 表格单元格添加完成，共 {len(cell_elements)} 个")
    
    @staticmethod
    def _add_mineru_image_to_slide(
        builder,
        slide,
        image_item: Dict[str, Any],
        mineru_dir: Path,
        scale_x: float = 1.0,
        scale_y: float = 1.0
    ):
        """
        Add image or table item from MinerU to slide
        
        Args:
            builder: PPTXBuilder instance
            slide: Target slide
            image_item: Image/table item from MinerU content_list
            mineru_dir: MinerU result directory
            scale_x: X-axis scale factor
            scale_y: Y-axis scale factor
        """
        bbox = image_item.get('bbox')
        if not bbox or len(bbox) != 4:
            logger.warning(f"Invalid bbox for image item: {image_item}")
            return
        
        original_bbox = bbox.copy()
        
        # Apply scale factors to bbox
        x0, y0, x1, y1 = bbox
        bbox = [
            int(x0 * scale_x),
            int(y0 * scale_y),
            int(x1 * scale_x),
            int(y1 * scale_y)
        ]
        
        if scale_x != 1.0 or scale_y != 1.0:
            logger.debug(f"Item bbox scaled: {original_bbox} -> {bbox} (scale: {scale_x:.3f}x{scale_y:.3f})")
        
        # Check if this is a table with子元素 (cells from Baidu OCR)
        item_type = image_item.get('element_type') or image_item.get('type', 'image')
        children = image_item.get('children', [])
        
        logger.debug(f"Processing {item_type} element, has {len(children)} children")
        
        if children and item_type == 'table':
            # Add editable table from child elements (cells)
            try:
                # Filter only table_cell elements
                cell_elements = [child for child in children if child.get('element_type') == 'table_cell']
                
                if cell_elements:
                    logger.info(f"添加可编辑表格（{len(cell_elements)}个单元格）")
                    ExportService._add_table_cell_elements_to_slide(
                        builder=builder,
                        slide=slide,
                        cell_elements=cell_elements,
                        scale_x=scale_x,
                        scale_y=scale_y
                    )
                    return  # Table added successfully
            except Exception as e:
                logger.exception("Failed to add table cells, falling back to image")
                # Fall through to add as image instead
        
        # Check if this is a table with HTML data (legacy)
        html_table = image_item.get('html_table')
        if html_table and item_type == 'table':
            # Add editable table from HTML
            try:
                builder.add_table_element(
                    slide=slide,
                    html_table=html_table,
                    bbox=bbox
                )
                logger.info(f"Added editable table at bbox {bbox}")
                return  # Table added successfully
            except Exception as e:
                logger.error(f"Failed to add table: {str(e)}, falling back to image")
                # Fall through to add as image instead
        
        # Add as image (either image type or table fallback)
        img_path_str = image_item.get('img_path', '')
        if not img_path_str:
            logger.warning(f"No img_path in item: {image_item}")
            return
        
        # Try to find the image file
        # MinerU may store images in 'images/' subdirectory
        possible_paths = [
            mineru_dir / img_path_str,
            mineru_dir / 'images' / Path(img_path_str).name,
            mineru_dir / Path(img_path_str).name,
        ]
        
        image_path = None
        for path in possible_paths:
            if path.exists():
                image_path = str(path)
                break
        
        if not image_path:
            logger.warning(f"Image file not found: {img_path_str}")
            # Add placeholder
            builder.add_image_placeholder(slide, bbox)
            return
        
        # Add image element
        try:
            builder.add_image_element(
                slide=slide,
                image_path=image_path,
                bbox=bbox
            )
        except Exception as e:
            logger.error(f"Failed to add image element: {str(e)}")
    
    @staticmethod
    def _collect_text_elements_for_extraction(
        elements: List,  # List[EditableElement]
        depth: int = 0
    ) -> List[tuple]:
        """
        递归收集所有需要提取样式的文本元素
        
        Args:
            elements: EditableElement列表
            depth: 当前递归深度
        
        Returns:
            元组列表，每个元组为 (element_id, image_path, text_content)
        """
        text_items = []
        
        for elem in elements:
            elem_type = elem.element_type
            
            # 文本类型元素需要提取样式
            if elem_type in ['text', 'title', 'table_cell', 'list', 'paragraph', 'header', 'footer', 'heading', 'table_caption', 'image_caption']:
                if elem.content and elem.image_path and os.path.exists(elem.image_path):
                    text = elem.content.strip()
                    if text:
                        text_items.append((elem.element_id, elem.image_path, text))
            
            # 递归处理子元素
            if hasattr(elem, 'children') and elem.children:
                child_items = ExportService._collect_text_elements_for_extraction(
                    elements=elem.children,
                    depth=depth + 1
                )
                text_items.extend(child_items)
        
        return text_items
    
    @staticmethod
    def _batch_extract_text_styles(
        text_items: List[tuple],
        text_attribute_extractor,
        max_workers: int = 8
    ) -> Dict[str, Any]:
        """
        批量并行提取文本样式（逐个裁剪区域分析）
        
        此方法对每一段文字的裁剪区域单独进行分析。
        经测试，此方法效果较好，目前仍在使用。
        
        备选方案：_batch_extract_text_styles_with_full_image 可一次性分析全图所有文本。
        
        Args:
            text_items: 元组列表，每个元组为 (element_id, image_path, text_content)
            text_attribute_extractor: 文本属性提取器
            max_workers: 并发数
        
        Returns:
            字典，key为element_id，value为TextStyleResult
        """
        from concurrent.futures import ThreadPoolExecutor, as_completed
        
        if not text_items or not text_attribute_extractor:
            return {}
        
        logger.info(f"并行提取 {len(text_items)} 个文本元素的样式（并发数: {max_workers}）...")
        
        results = {}
        
        def extract_single(item):
            element_id, image_path, text_content = item
            try:
                style = text_attribute_extractor.extract(
                    image=image_path,
                    text_content=text_content
                )
                return element_id, style
            except Exception as e:
                logger.warning(f"提取文字样式失败 [{element_id}]: {e}")
                return element_id, None
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(extract_single, item): item[0] for item in text_items}
            
            for future in as_completed(futures):
                element_id, style = future.result()
                if style is not None:
                    results[element_id] = style
        
        logger.info(f"✓ 文本样式提取完成，成功 {len(results)}/{len(text_items)} 个")
        return results
    
    @staticmethod
    def _collect_text_elements_for_batch_extraction(
        elements: List,  # List[EditableElement]
        depth: int = 0
    ) -> List[Dict[str, Any]]:
        """
        递归收集所有需要批量提取样式的文本元素（新格式，包含bbox）
        
        Args:
            elements: EditableElement列表
            depth: 当前递归深度
        
        Returns:
            字典列表，每个字典包含 element_id, bbox, content
        """
        text_items = []
        
        for elem in elements:
            elem_type = elem.element_type
            
            # 文本类型元素需要提取样式
            if elem_type in ['text', 'title', 'table_cell', 'list', 'paragraph', 'header', 'footer', 'heading', 'table_caption', 'image_caption']:
                if elem.content:
                    text = elem.content.strip()
                    if text:
                        # 使用全局坐标 bbox_global
                        bbox = elem.bbox_global if hasattr(elem, 'bbox_global') and elem.bbox_global else elem.bbox
                        text_items.append({
                            'element_id': elem.element_id,
                            'bbox': [bbox.x0, bbox.y0, bbox.x1, bbox.y1],
                            'content': text
                        })
            
            # 递归处理子元素
            if hasattr(elem, 'children') and elem.children:
                child_items = ExportService._collect_text_elements_for_batch_extraction(
                    elements=elem.children,
                    depth=depth + 1
                )
                text_items.extend(child_items)
        
        return text_items
    
    @staticmethod
    def _batch_extract_text_styles_with_full_image(
        editable_images: List,  # List[EditableImage]
        text_attribute_extractor,
        max_workers: int = 4
    ) -> Dict[str, Any]:
        """
        【新逻辑】使用全图批量提取所有文本样式
        
        新方法：给 caption model 提供全图，以及提取后的所有文本 bbox 和内容，
        让模型一次性分析所有文本的样式属性（颜色、粗体、对齐等）。
        
        优势：模型可以看到全局信息，分析更准确。
        
        Args:
            editable_images: EditableImage列表，每个对应一张PPT页面
            text_attribute_extractor: 文本属性提取器（需要有 extract_batch_with_full_image 方法）
            max_workers: 并发处理页面数
        
        Returns:
            字典，key为element_id，value为TextStyleResult
        """
        from concurrent.futures import ThreadPoolExecutor, as_completed
        
        if not editable_images or not text_attribute_extractor:
            return {}
        
        # 检查提取器是否支持批量提取
        if not hasattr(text_attribute_extractor, 'extract_batch_with_full_image'):
            logger.warning("提取器不支持 extract_batch_with_full_image 方法，回退到旧逻辑")
            # 回退到旧逻辑
            all_text_items = []
            for editable_img in editable_images:
                text_items = ExportService._collect_text_elements_for_extraction(editable_img.elements)
                all_text_items.extend(text_items)
            return ExportService._batch_extract_text_styles(
                text_items=all_text_items,
                text_attribute_extractor=text_attribute_extractor,
                max_workers=max_workers * 2
            )
        
        logger.info(f"【新逻辑】使用全图批量分析 {len(editable_images)} 页的文本样式...")
        
        all_results = {}
        
        def process_single_page(editable_img, page_idx):
            """处理单个页面的文本样式提取"""
            try:
                # 收集该页面的所有文本元素
                text_elements = ExportService._collect_text_elements_for_batch_extraction(
                    editable_img.elements
                )
                
                if not text_elements:
                    logger.info(f"  页面 {page_idx + 1}: 无文本元素")
                    return {}
                
                logger.info(f"  页面 {page_idx + 1}: 分析 {len(text_elements)} 个文本元素...")
                
                # 使用原始图片路径作为全图
                full_image_path = editable_img.image_path
                
                # 调用批量提取方法
                page_results = text_attribute_extractor.extract_batch_with_full_image(
                    full_image=full_image_path,
                    text_elements=text_elements
                )
                
                logger.info(f"  页面 {page_idx + 1}: 成功提取 {len(page_results)} 个元素的样式")
                return page_results
                
            except Exception as e:
                logger.error(f"页面 {page_idx + 1} 文本样式提取失败: {e}", exc_info=True)
                return {}
        
        # 并发处理所有页面
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(process_single_page, img, idx): idx 
                for idx, img in enumerate(editable_images)
            }
            
            for future in as_completed(futures):
                page_idx = futures[future]
                try:
                    page_results = future.result()
                    all_results.update(page_results)
                except Exception as e:
                    logger.error(f"页面 {page_idx + 1} 处理失败: {e}")
        
        total_elements = sum(
            len(ExportService._collect_text_elements_for_batch_extraction(img.elements))
            for img in editable_images
        )
        logger.info(f"✓ 全图批量文本样式提取完成，成功 {len(all_results)}/{total_elements} 个")
        
        return all_results
    
    @staticmethod
    def _batch_extract_text_styles_hybrid(
        editable_images: List,  # List[EditableImage]
        text_attribute_extractor,
        max_workers: int = 8,
        fail_fast: bool = False,
        local_timeout_seconds: float = 180.0
    ) -> Tuple[Dict[str, Any], List[Tuple[str, str]]]:
        """
        【混合策略】结合全局识别和单个裁剪识别的优势
        
        策略：
        - 全局识别（全图分析）：获取 is_bold、is_italic、is_underline、text_alignment
          因为这些属性需要看整体布局和上下文才能判断准确
        - 单个裁剪识别：获取 font_color
          因为颜色需要精确看局部像素才能识别准确
        
        Args:
            editable_images: EditableImage列表，每个对应一张PPT页面
            text_attribute_extractor: 文本属性提取器
            max_workers: 并发数
        
        Returns:
            (results, failed_extractions):
            - results: 字典，key为element_id，value为TextStyleResult（合并后的结果）
            - failed_extractions: 失败列表，每项为 (element_id, error_reason)
        """
        from concurrent.futures import ThreadPoolExecutor, as_completed
        from services.image_editability.text_attribute_extractors import TextStyleResult
        
        if not editable_images or not text_attribute_extractor:
            return {}, []
        
        # 检查提取器是否支持批量提取
        if not hasattr(text_attribute_extractor, 'extract_batch_with_full_image'):
            logger.warning("提取器不支持混合策略，回退到单个裁剪识别")
            all_text_items = []
            for editable_img in editable_images:
                text_items = ExportService._collect_text_elements_for_extraction(editable_img.elements)
                all_text_items.extend(text_items)
            results = ExportService._batch_extract_text_styles(
                text_items=all_text_items,
                text_attribute_extractor=text_attribute_extractor,
                max_workers=max_workers
            )
            return results, []  # 回退方法暂不收集失败信息
        
        logger.info(f"【混合策略】开始分析 {len(editable_images)} 页的文本样式...")
        logger.info(f"  - 全局识别: is_bold, is_italic, is_underline, text_alignment")
        logger.info(f"  - 单个识别: font_color")
        
        # Step 1: 收集所有文本元素
        all_text_items = []  # 用于单个裁剪识别 (element_id, image_path, content)
        page_text_elements = {}  # 用于全局识别 {page_idx: [text_elements]}
        
        for page_idx, editable_img in enumerate(editable_images):
            # 收集用于单个裁剪识别的数据
            text_items = ExportService._collect_text_elements_for_extraction(editable_img.elements)
            all_text_items.extend(text_items)
            
            # 收集用于全局识别的数据
            batch_elements = ExportService._collect_text_elements_for_batch_extraction(editable_img.elements)
            if batch_elements:
                page_text_elements[page_idx] = {
                    'image_path': editable_img.image_path,
                    'elements': batch_elements
                }
        
        if not all_text_items:
            return {}
        
        # Step 2: 并行执行两种识别
        global_results = {}  # 全局识别结果
        local_results = {}   # 单个裁剪识别结果
        
        def extract_global_for_page(page_idx, page_data):
            """全局识别单页"""
            try:
                results = text_attribute_extractor.extract_batch_with_full_image(
                    full_image=page_data['image_path'],
                    text_elements=page_data['elements']
                )
                return page_idx, results, None
            except Exception as e:
                logger.warning(f"全局识别页面 {page_idx + 1} 失败: {e}")
                return page_idx, {}, str(e)
        
        # 收集失败信息
        failed_extractions = []  # [(element_id, reason), ...]
        
        def extract_local_single(item):
            """单个裁剪识别"""
            element_id, image_path, text_content = item
            try:
                style = text_attribute_extractor.extract(
                    image=image_path,
                    text_content=text_content
                )
                # Check for real success: style must exist and not be an error result
                # (CaptionModelTextAttributeExtractor returns TextStyleResult(confidence=0.0, metadata={'error':...}) on failure)
                is_error = style and style.confidence == 0.0 and style.metadata.get('error')
                if style and not is_error:
                    return element_id, style, None
                else:
                    error_msg = style.metadata.get('error', '样式提取返回空') if style else "样式提取返回空"
                    if fail_fast:
                        raise ExportService._build_style_extraction_error(
                            error_msg,
                            element_id=element_id,
                            text_content=text_content
                        )
                    return element_id, None, error_msg
            except ExportError:
                raise  # 重新抛出 ExportError
            except Exception as e:
                logger.warning(f"单个识别失败 [{element_id}]: {e}")
                if fail_fast:
                    raise ExportService._build_style_extraction_error(
                        str(e),
                        element_id=element_id,
                        text_content=text_content
                    )
                return element_id, None, str(e)
        
        # 先做全图识别；只有全图漏掉的文本元素才走单个裁剪补识别。
        logger.info(f"  全图识别 {len(page_text_elements)} 页，必要时补识别缺失文本元素...")
        local_deadline = time.monotonic() + local_timeout_seconds

        executor = ThreadPoolExecutor(max_workers=max_workers)
        try:
            # 提交全局识别任务
            global_futures = {
                executor.submit(extract_global_for_page, idx, data): ('global', idx)
                for idx, data in page_text_elements.items()
            }
            
            # 收集全局识别结果
            for future in as_completed(global_futures):
                task_type, page_idx = global_futures[future]
                try:
                    _, page_results, page_error = future.result()
                    global_results.update(page_results)
                    expected_element_ids = {
                        element['element_id'] for element in page_text_elements[page_idx]['elements']
                    }
                    missing_element_ids = expected_element_ids - set(page_results.keys())
                    if page_error:
                        if fail_fast:
                            raise ExportService._build_style_extraction_error(page_error, page_idx=page_idx)
                        failed_extractions.extend(
                            (element_id, f"全局识别失败: {page_error}")
                            for element_id in expected_element_ids
                        )
                    elif missing_element_ids:
                        reason = "全局识别未返回完整结果"
                        if fail_fast:
                            raise ExportService._build_style_extraction_error(reason, page_idx=page_idx)
                        failed_extractions.extend((element_id, reason) for element_id in missing_element_ids)
                except Exception as e:
                    logger.error(f"全局识别任务失败: {e}")
                    if fail_fast:
                        if isinstance(e, ExportError):
                            raise
                        raise ExportService._build_style_extraction_error(str(e), page_idx=page_idx) from e
                    expected_element_ids = [
                        element['element_id'] for element in page_text_elements[page_idx]['elements']
                    ]
                    failed_extractions.extend(
                        (element_id, f"全局识别失败: {e}")
                        for element_id in expected_element_ids
                    )

            missing_items = [
                item for item in all_text_items
                if item[0] not in global_results
            ]
            if missing_items:
                logger.info(f"  补识别 {len(missing_items)} 个全图未返回的文本元素...")

            local_futures = {
                executor.submit(extract_local_single, item): ('local', item[0])
                for item in missing_items
            }

            # 收集单个裁剪补识别结果
            remaining_futures = set(local_futures)
            while remaining_futures:
                timeout = local_deadline - time.monotonic()
                if timeout <= 0:
                    break
                try:
                    future = next(as_completed(remaining_futures, timeout=timeout))
                except TimeoutError:
                    break
                remaining_futures.remove(future)
                task_type, element_id = local_futures[future]
                try:
                    elem_id, style, error = future.result()
                    if style is not None:
                        local_results[elem_id] = style
                    if error:
                        failed_extractions.append((elem_id, error))
                except Exception as e:
                    logger.error(f"单个识别任务失败: {e}")
                    if fail_fast:
                        raise
                    failed_extractions.append((element_id, str(e)))

            if remaining_futures:
                reason = "单个识别超时，已使用全局样式"
                logger.warning(f"单个识别超时，跳过 {len(remaining_futures)} 个文本元素")
                for future in remaining_futures:
                    future.cancel()
                    failed_extractions.append((local_futures[future][1], reason))
        finally:
            executor.shutdown(wait=False, cancel_futures=True)
        
        # Step 3: 合并结果
        # 优先使用全局识别的布局属性，使用单个识别的颜色属性
        merged_results = {}
        
        all_element_ids = set(global_results.keys()) | set(local_results.keys())
        
        for element_id in all_element_ids:
            global_style = global_results.get(element_id)
            local_style = local_results.get(element_id)
            
            if global_style and local_style:
                # 混合：颜色用单个识别（包括 colored_segments），布局用全局识别
                merged_results[element_id] = TextStyleResult(
                    font_color_rgb=local_style.font_color_rgb,  # 单个识别的颜色
                    colored_segments=local_style.colored_segments,  # 单个识别的多颜色片段
                    is_bold=global_style.is_bold,              # 全局识别的粗体
                    is_italic=global_style.is_italic,          # 全局识别的斜体
                    is_underline=global_style.is_underline,    # 全局识别的下划线
                    text_alignment=global_style.text_alignment, # 全局识别的对齐
                    confidence=0.9,
                    metadata={
                        'source': 'hybrid',
                        'color_source': 'local',
                        'layout_source': 'global'
                    }
                )
            elif local_style:
                # 只有单个识别结果
                merged_results[element_id] = local_style
            elif global_style:
                # 只有全局识别结果
                merged_results[element_id] = global_style
        
        logger.info(f"✓ 混合策略完成: 全局识别 {len(global_results)} 个, 单个识别 {len(local_results)} 个, 合并 {len(merged_results)} 个, 失败 {len(failed_extractions)} 个")
        
        return merged_results, failed_extractions

    @staticmethod
    def _collect_foreground_bboxes_for_background_mask(elements: List, depth: int = 0) -> List[Tuple[int, int, int, int]]:
        bboxes = []
        for elem in elements:
            bbox = elem.bbox if depth == 0 else getattr(elem, 'bbox_global', None) or elem.bbox
            if bbox.x1 > bbox.x0 and bbox.y1 > bbox.y0:
                bboxes.append((int(bbox.x0), int(bbox.y0), int(bbox.x1), int(bbox.y1)))
        return bboxes

    @staticmethod
    def _sample_background_color(image: Image.Image, bbox: Tuple[int, int, int, int]) -> Tuple[int, int, int]:
        width, height = image.size
        x0, y0, x1, y1 = bbox
        pad = max(4, min(width, height) // 80)
        samples = []

        def add_sample(x: int, y: int):
            if 0 <= x < width and 0 <= y < height:
                samples.append(image.getpixel((x, y))[:3])

        step_x = max(1, (x1 - x0) // 12)
        step_y = max(1, (y1 - y0) // 12)
        for x in range(max(0, x0), min(width, x1) + 1, step_x):
            add_sample(x, y0 - pad)
            add_sample(x, y1 + pad)
        for y in range(max(0, y0), min(height, y1) + 1, step_y):
            add_sample(x0 - pad, y)
            add_sample(x1 + pad, y)

        if not samples:
            add_sample(min(max(x0, 0), width - 1), min(max(y0, 0), height - 1))
        return tuple(sorted(channel)[len(channel) // 2] for channel in zip(*samples))

    @staticmethod
    def _create_local_clean_background(
        image_path: str,
        elements: List,
        output_path: Optional[str] = None,
    ) -> Optional[str]:
        bboxes = ExportService._collect_foreground_bboxes_for_background_mask(elements)
        if not bboxes:
            return None

        image = Image.open(image_path).convert('RGB')
        draw = ImageDraw.Draw(image)
        width, height = image.size
        for bbox in bboxes:
            x0, y0, x1, y1 = bbox
            pad = max(2, min(width, height) // 180)
            box = (
                max(0, x0 - pad),
                max(0, y0 - pad),
                min(width, x1 + pad),
                min(height, y1 + pad),
            )
            draw.rectangle(box, fill=ExportService._sample_background_color(image, bbox))

        if output_path:
            target = Path(output_path)
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target)
            return str(target)

        tmp = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
        tmp.close()
        image.save(tmp.name)
        return tmp.name

    @staticmethod
    def _editable_rebuild_artifacts_dir(output_file: Optional[str]) -> Path:
        if output_file:
            return Path(output_file).with_suffix('.editable')
        return Path(tempfile.mkdtemp(prefix='editable_pptx_'))

    @staticmethod
    def _manifest_box_px(elem, depth: int) -> List[int]:
        bbox = elem.bbox if depth == 0 else getattr(elem, 'bbox_global', None) or elem.bbox
        return [
            int(bbox.x0),
            int(bbox.y0),
            int(bbox.x1 - bbox.x0),
            int(bbox.y1 - bbox.y0),
        ]

    @staticmethod
    def _text_hint_from_element(elem) -> Dict[str, Any]:
        metadata = getattr(elem, 'metadata', None) or {}
        hint = metadata.get('text_hint') if isinstance(metadata.get('text_hint'), dict) else {}
        source = {**metadata, **hint}
        bbox = getattr(elem, 'bbox', None)
        glyph_height = source.get('glyph_height_px') or source.get('glyph_height')
        font_size = source.get('font_size_pt') or source.get('font_pt') or source.get('font_size')
        if font_size is not None:
            try:
                font_size = float(font_size)
                if not math.isfinite(font_size) or font_size <= 0:
                    font_size = None
            except (TypeError, ValueError, OverflowError):
                font_size = None
        if font_size is None and glyph_height:
            try:
                font_size = round(float(glyph_height) * 0.72)
            except (TypeError, ValueError, OverflowError):
                font_size = None
        if font_size is None and bbox:
            height = getattr(bbox, 'height', None)
            if height is None:
                height = float(bbox.y1) - float(bbox.y0)
            font_size = round(float(height) * 0.45)
        if font_size is None:
            return {}
        font_size = max(6, min(200, round(font_size)))
        return {
            'font_size': int(font_size),
            'glyph_height_px': glyph_height,
            'size_group': source.get('size_group') or getattr(elem, 'element_type', 'default'),
            'source': source.get('source') or metadata.get('source') or 'bbox',
        }

    @staticmethod
    def _apply_text_hint_size_groups(text_boxes: List[Dict[str, Any]]):
        grouped = {}
        for item in text_boxes:
            hint = item.get('text_hint') or {}
            group = hint.get('size_group')
            if group and hint.get('font_size'):
                grouped.setdefault(group, []).append(int(hint['font_size']))

        group_sizes = {
            group: int(round(sum(values) / len(values)))
            for group, values in grouped.items()
        }
        for item in text_boxes:
            hint = item.get('text_hint') or {}
            group = hint.get('size_group')
            if group in group_sizes:
                item['font_size'] = group_sizes[group]
                item['font_size_source'] = 'text_hint_size_group'
            elif hint.get('font_size'):
                item['font_size'] = int(hint['font_size'])
                item['font_size_source'] = hint.get('source') or 'text_hint'

    @staticmethod
    def _text_hint_font_sizes(elements: List) -> Dict[str, int]:
        text_boxes, _, _ = ExportService._collect_rebuild_manifest_elements(elements)
        return {
            item['id']: item['font_size']
            for item in text_boxes
            if item.get('font_size')
        }

    @staticmethod
    def _collect_rebuild_manifest_elements(elements: List, depth: int = 0) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        text_types = {
            'text', 'title', 'list', 'paragraph', 'header', 'footer', 'heading',
            'table_caption', 'image_caption', 'equation', 'interline_equation',
            'inline_equation', 'table_cell',
        }
        image_types = {'image', 'figure', 'chart', 'table'}
        text_boxes = []
        images = []
        visual_inventory = []

        for elem in elements:
            box_px = ExportService._manifest_box_px(elem, depth)
            if elem.element_type in text_types and elem.content and elem.content.strip():
                item = {
                    'id': elem.element_id,
                    'type': elem.element_type,
                    'text': elem.content.strip(),
                    'box_px': box_px,
                    'source': 'editable-element',
                }
                text_hint = ExportService._text_hint_from_element(elem)
                if text_hint:
                    item['text_hint'] = text_hint
                text_boxes.append(item)
            elif elem.element_type in image_types:
                visual_inventory.append({
                    'id': elem.element_id,
                    'type': elem.element_type,
                    'box_px': box_px,
                    'source': elem.image_path,
                })
                if elem.image_path:
                    images.append({
                        'id': elem.element_id,
                        'path': elem.image_path,
                        'box_px': box_px,
                    })

            if getattr(elem, 'children', None):
                child_text, child_images, child_visuals = ExportService._collect_rebuild_manifest_elements(
                    elem.children,
                    depth + 1,
                )
                text_boxes.extend(child_text)
                images.extend(child_images)
                visual_inventory.extend(child_visuals)

        ExportService._apply_text_hint_size_groups(text_boxes)
        return text_boxes, images, visual_inventory

    @staticmethod
    def _build_page_rebuild_manifest(
        editable_img,
        page_idx: int,
        background_source: str,
        background_path: str,
        high_fidelity_editable: bool = False
    ) -> Dict[str, Any]:
        text_boxes, images, visual_inventory = ExportService._collect_rebuild_manifest_elements(editable_img.elements)
        formula_inventory = [
            {
                'id': item['id'],
                'text': item['text'],
                'decision': 'existing-formula-fallback',
                'editable': False,
            }
            for item in text_boxes
            if item.get('type') in {'equation', 'interline_equation', 'inline_equation'}
        ]
        if background_path == editable_img.image_path and text_boxes:
            background_mode = 'source-full-slide-raster'
        elif background_path != background_source:
            background_mode = 'source-preserving-local-cleanup'
        elif background_source != editable_img.image_path:
            background_mode = 'external-clean-background'
        else:
            background_mode = 'source-reused-no-editable-text'

        return {
            'schema_version': 1,
            'page': page_idx + 1,
            'slide': {'width_px': editable_img.width, 'height_px': editable_img.height},
            'source': {
                'image_path': editable_img.image_path,
                'width_px': editable_img.width,
                'height_px': editable_img.height,
            },
            'background_strategy': {
                'mode': background_mode,
                'source': background_source,
                'rendered_path': background_path,
                'removed_foreground': [
                    item['id'] for item in [*text_boxes, *visual_inventory]
                ],
                'comparison_note': 'local cleanup masks every foreground region rebuilt as an editable element',
            },
            'page_strategy': {
                'high_fidelity_editable': bool(high_fidelity_editable),
                'asset_sheet_separation': 'requested' if high_fidelity_editable else 'disabled',
            },
            'text_inventory': [item['text'] for item in text_boxes],
            'visual_inventory': visual_inventory,
            'quality_checks': {
                'font_size_calibrated': bool(text_boxes),
                'visual_inventory_matched': None,
                'background_strategy_checked': None,
                'shape_corner_geometry_checked': None,
            },
            'text_boxes': text_boxes,
            'shapes': [],
            'images': images,
            'formula_inventory': formula_inventory,
            'asset_provenance': [
                {
                    'path': item['path'],
                    'source': item['path'],
                    'source_type': 'user-provided',
                    'provenance_note': 'existing extracted page asset reused by current exporter',
                }
                for item in images
            ],
        }

    @staticmethod
    def _validate_page_rebuild_manifest(manifest: Dict[str, Any]) -> Dict[str, Any]:
        errors = []
        if manifest.get('background_strategy', {}).get('mode') == 'source-full-slide-raster' and manifest.get('text_boxes'):
            errors.append('禁止使用原始整页截图作为背景再叠加可编辑文字')
        for item in manifest.get('text_boxes', []):
            if not item.get('box_px'):
                errors.append(f"文本元素缺少坐标: {item.get('id')}")
        for item in manifest.get('images', []):
            if not item.get('box_px'):
                errors.append(f"图片元素缺少坐标: {item.get('id')}")
                continue
            slide = manifest.get('slide') or {}
            slide_area = (slide.get('width_px') or 0) * (slide.get('height_px') or 0)
            box = item['box_px']
            if slide_area and len(box) == 4 and (box[2] * box[3]) / slide_area >= 0.9:
                errors.append(f"禁止将整页栅格图作为可编辑前景元素: {item.get('id')}")
        render_result = manifest.get('render_result') or {}
        if render_result and not render_result.get('background_added'):
            errors.append('背景图写入PPTX失败')
        expected_foreground = len(manifest.get('text_boxes', [])) + len(manifest.get('images', []))
        if render_result and expected_foreground and render_result.get('foreground_shape_count', 0) == 0:
            errors.append('未向PPTX写入任何可编辑前景元素')
        return {'passed': not errors, 'errors': errors}

    @staticmethod
    def _write_page_rebuild_artifacts(artifacts_dir: Path, page_idx: int, manifest: Dict[str, Any], validation: Dict[str, Any]):
        page_dir = artifacts_dir / f"page_{page_idx + 1:03d}"
        page_dir.mkdir(parents=True, exist_ok=True)
        (page_dir / 'manifest.json').write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding='utf-8',
        )
        (page_dir / 'validation.json').write_text(
            json.dumps(validation, ensure_ascii=False, indent=2),
            encoding='utf-8',
        )

    @staticmethod
    def _validate_pptx_package(source) -> None:
        stream = None
        if isinstance(source, (bytes, bytearray)):
            stream = io.BytesIO(source)
            package = stream
        else:
            package_path = Path(source)
            if not package_path.is_file() or package_path.stat().st_size == 0:
                raise ExportError('PPTX 输出文件不存在或为空', error_type='pptx_validation')
            package = str(package_path)

        try:
            if not is_zipfile(package):
                raise ExportError('PPTX 输出不是有效的 Office 文件', error_type='pptx_validation')
            if stream:
                stream.seek(0)
            with ZipFile(package if not stream else stream) as archive:
                names = set(archive.namelist())
                required = {'[Content_Types].xml', 'ppt/presentation.xml'}
                if not required.issubset(names) or not any(
                    name.startswith('ppt/slides/slide') and name.endswith('.xml')
                    for name in names
                ):
                    raise ExportError('PPTX 输出缺少必要的演示文稿内容', error_type='pptx_validation')
        except ExportError:
            raise
        except (BadZipFile, OSError) as e:
            raise ExportError(
                f'PPTX 输出校验失败: {e}',
                error_type='pptx_validation',
            ) from e
    
    @staticmethod


    # ------------------------------------------------------------------
    # High-fidelity editable export: foreground asset-sheet separation
    # ------------------------------------------------------------------

    @staticmethod
    def _create_foreground_asset_contact_sheet(
        elements, output_dir, padding=8, columns=3,
    ):
        import os
        from PIL import Image
        items = [e for e in elements if e.get("image_path") and os.path.exists(e["image_path"])]
        if not items:
            return None, []
        images = []
        for item in items:
            try:
                img = Image.open(item["image_path"]).convert("RGBA")
            except Exception:
                continue
            images.append((item, img))
        if not images:
            return None, []
        max_w = max(img.size[0] for _, img in images)
        max_h = max(img.size[1] for _, img in images)
        cols = min(columns, len(images))
        rows = (len(images) + cols - 1) // cols
        sheet_w = cols * (max_w + padding) + padding
        sheet_h = rows * (max_h + padding) + padding
        sheet = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))
        grid = []
        for idx, (item, img) in enumerate(images):
            col = idx % cols
            row = idx // cols
            x = padding + col * (max_w + padding)
            y = padding + row * (max_h + padding)
            sheet.paste(img, (x, y), img)
            grid.append({
                "id": item.get("id", str(idx)),
                "x": x, "y": y,
                "w": img.size[0], "h": img.size[1],
            })
        output_path = os.path.join(str(output_dir), "foreground_asset_sheet.png")
        sheet.save(output_path)
        return output_path, grid

    @staticmethod
    def _split_processed_asset_sheet(sheet_path, grid, output_dir):
        import os
        from PIL import Image
        from pathlib import Path
        sheet = Image.open(sheet_path).convert("RGBA")
        assets = []
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        for cell in grid:
            box = (cell["x"], cell["y"], cell["x"] + cell["w"], cell["y"] + cell["h"])
            cropped = sheet.crop(box)
            out_path = output_dir / f"asset_{cell['id']}.png"
            cropped.save(str(out_path))
            assets.append({
                "id": cell["id"],
                "image_path": str(out_path),
                "box_px": [],
            })
        return assets

    @staticmethod
    def _collect_foreground_image_elements(elements, depth=0):
        result = []
        for elem in elements:
            if (
                elem.element_type in ("image", "figure")
                and elem.image_path
                and getattr(elem, "is_icon", None) is True
            ):
                bbox = elem.bbox if depth == 0 else getattr(elem, "bbox_global", None) or elem.bbox
                w = bbox.x1 - bbox.x0
                h = bbox.y1 - bbox.y0
                parent_w = getattr(elem, "_parent_width", None)
                parent_h = getattr(elem, "_parent_height", None)
                if parent_w and parent_h:
                    coverage = (w * h) / (parent_w * parent_h)
                    if coverage > 0.9:
                        continue
                result.append({
                    "id": elem.element_id,
                    "image_path": elem.image_path,
                    "box_px": [int(bbox.x0), int(bbox.y0), int(w), int(h)],
                })
            if getattr(elem, "children", None):
                result.extend(ExportService._collect_foreground_image_elements(
                    elem.children, depth + 1,
                ))
        return result

    @staticmethod
    def _run_asset_sheet_separation(
        editable_img,
        output_dir,
        high_fidelity_editable=False,
        image_editing_provider=None,
        warnings=None,
    ):
        if not high_fidelity_editable:
            return {}
        foreground = ExportService._collect_foreground_image_elements(editable_img.elements)
        if not foreground:
            return {}
        logger.info("  [asset-sheet] collecting %d foreground elements for separation", len(foreground))
        sheet_path, grid = ExportService._create_foreground_asset_contact_sheet(
            foreground, output_dir, padding=12, columns=3,
        )
        if not sheet_path:
            return {}
        logger.info("  [asset-sheet] contact sheet created: %s", sheet_path)

        if image_editing_provider is None:
            message = "高保真前景分离未执行：当前图像模型不可用"
            logger.warning("  [asset-sheet] %s", message)
            if warnings:
                warnings.add_warning(message)
            return {}

        try:
            from PIL import Image
            with Image.open(sheet_path) as source_sheet:
                sheet_img = source_sheet.convert("RGBA")
                prompt = (
                    "Remove the background from every individual icon, badge, and decoration on this contact sheet. "
                    "Each item must be isolated on a completely transparent background. "
                    "Preserve the exact shape, colors, and details of every item. "
                    "Do not change the layout or positions of the items on the sheet."
                )
                result = image_editing_provider.generate_image(
                    prompt=prompt,
                    ref_images=[sheet_img],
                )
            if result is None:
                raise RuntimeError("图像模型未返回结果")

            result = result.convert("RGBA")
            if result.size != sheet_img.size:
                logger.warning(
                    "  [asset-sheet] model changed sheet size from %s to %s; resizing back",
                    sheet_img.size,
                    result.size,
                )
                result = result.resize(sheet_img.size, Image.Resampling.LANCZOS)
            if result.getchannel("A").getextrema()[0] == 255:
                raise RuntimeError("图像模型未返回透明背景")

            processed_path = str(Path(output_dir) / "foreground_asset_sheet_processed.png")
            result.save(processed_path)
            logger.info("  [asset-sheet] model separation complete: %s", processed_path)
        except Exception as e:
            message = f"高保真前景分离失败，已保留原始元素: {e}"
            logger.warning("  [asset-sheet] %s", message)
            if warnings:
                warnings.add_warning(message)
            return {}

        assets = ExportService._split_processed_asset_sheet(processed_path, grid, output_dir)
        return {a["id"]: a["image_path"] for a in assets}


    @staticmethod
    def _apply_separated_assets(elements, asset_map):
        for elem in elements:
            if elem.element_id in asset_map:
                elem.image_path = asset_map[elem.element_id]
                elem.metadata["asset_sheet_separated"] = True
            if getattr(elem, "children", None):
                ExportService._apply_separated_assets(elem.children, asset_map)

    def create_editable_pptx_with_recursive_analysis(
        image_paths: List[str] = None,
        output_file: str = None,
        slide_width_pixels: int = 1920,
        slide_height_pixels: int = 1080,
        max_depth: int = 2,
        max_workers: int = 8,
        editable_images: List = None,  # 可选：直接传入已分析的EditableImage列表
        text_attribute_extractor = None,  # 可选：文字属性提取器，用于提取颜色、粗体、斜体等样式
        progress_callback = None,  # 可选：进度回调函数 (step, message, percent) -> None
        export_extractor_method: str = 'hybrid',  # 组件提取方法: mineru, hybrid
        export_inpaint_method: str = 'hybrid',  # 背景修复方法: generative, baidu, hybrid
        export_high_fidelity_editable: bool = False,  # 高保真可编辑导出，高成本外部模型能力默认关闭
        image_editing_provider=None,  # asset-sheet 分离用图像编辑模型
        enable_icon_subject_extraction: bool = False,  # 已废弃，保留参数兼容旧调用方
        fail_fast: bool = True,  # 是否在遇到错误时立即停止（False则收集警告继续）
        analysis_status_interval_seconds: float = 15.0,
        analysis_stall_timeout_seconds: float = 900.0
    ) -> Tuple[Optional[bytes], ExportWarnings]:
        """
        使用递归图片可编辑化服务创建可编辑PPTX
        
        这是新的架构方法，使用ImageEditabilityService进行递归版面分析。
        
        两种使用方式：
        1. 传入 image_paths：自动分析图片并生成PPTX
        2. 传入 editable_images：直接使用已分析的结果（避免重复分析）
        
        配置（如 MinerU token）自动从 Flask app.config 获取。
        
        Args:
            image_paths: 图片路径列表（可选，与editable_images二选一）
            output_file: 输出文件路径（可选）
            slide_width_pixels: 目标幻灯片宽度
            slide_height_pixels: 目标幻灯片高度
            max_depth: 最大递归深度
            max_workers: 并发处理数
            editable_images: 已分析的EditableImage列表（可选，与image_paths二选一）
            text_attribute_extractor: 文字属性提取器（可选），用于提取文字颜色、粗体、斜体等样式
                可通过 TextAttributeExtractorFactory.create_caption_model_extractor() 创建
            export_extractor_method: 组件提取方法 ('mineru' 或 'hybrid'，默认 'hybrid')
            export_inpaint_method: 背景修复方法 ('generative', 'baidu', 'hybrid'，默认 'hybrid')
            fail_fast: 是否在遇到错误时立即停止（默认 True）。设为 False 则收集警告继续导出。

        Returns:
            (pptx_bytes, warnings): 元组，包含 PPTX 字节流和警告信息
            - pptx_bytes: PPTX 文件字节流（如果 output_file 为 None），否则为 None
            - warnings: ExportWarnings 对象，包含所有警告信息
        """
        from services.image_editability import ServiceConfig, ImageEditabilityService
        from utils.pptx_builder import PPTXBuilder
        
        # 初始化警告收集器
        warnings = ExportWarnings()
        
        # 辅助函数：报告进度
        def report_progress(step: str, message: str, percent: int):
            logger.info(f"[进度 {percent}%] {step}: {message}")
            if progress_callback:
                try:
                    progress_callback(step, message, percent)
                except Exception as e:
                    logger.warning(f"进度回调失败: {e}")
        
        # 如果已提供分析结果，直接使用；否则需要分析
        if editable_images is not None:
            logger.info(f"使用已提供的 {len(editable_images)} 个分析结果创建PPTX")
            report_progress("准备", f"使用已有分析结果（{len(editable_images)} 页）", 10)
        else:
            if not image_paths:
                raise ValueError("必须提供 image_paths 或 editable_images 之一")
            
            total_pages = len(image_paths)
            logger.info(f"开始使用递归分析方法创建可编辑PPTX，共 {total_pages} 页")
            report_progress("开始", f"准备分析 {total_pages} 页幻灯片...", 0)
            
            # 1. 创建ImageEditabilityService（配置自动从 Flask config 获取，使用项目导出设置）
            logger.info(
                f"使用导出设置: extractor={export_extractor_method}, "
                f"inpaint={export_inpaint_method}"
            )
            config = ServiceConfig.from_defaults(
                max_depth=max_depth,
                extractor_method=export_extractor_method,
                inpaint_method=export_inpaint_method,
            )
            editability_service = ImageEditabilityService(config)

            # 2. 并发处理所有页面，生成EditableImage结构
            report_progress("版面分析", f"开始分析 {total_pages} 张图片（并发数: {max_workers}）...", 5)
            from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait

            editable_images = []
            completed_count = 0
            executor = ThreadPoolExecutor(max_workers=max_workers)
            try:
                futures = {
                    executor.submit(editability_service.make_image_editable, img_path): idx
                    for idx, img_path in enumerate(image_paths)
                }

                results = [None] * len(image_paths)
                pending_futures = set(futures)
                last_completed_at = time.monotonic()

                while pending_futures:
                    done_futures, pending_futures = wait(
                        pending_futures,
                        timeout=analysis_status_interval_seconds,
                        return_when=FIRST_COMPLETED
                    )

                    if not done_futures:
                        percent = 5 + int(35 * completed_count / total_pages)
                        pending_pages = sorted(futures[future] + 1 for future in pending_futures)
                        preview = ", ".join(str(page) for page in pending_pages[:8])
                        if len(pending_pages) > 8:
                            preview += f" 等 {len(pending_pages)} 页"
                        report_progress(
                            "版面分析",
                            f"仍在分析，已完成 {completed_count}/{total_pages} 页；等待第 {preview} 页",
                            percent
                        )

                        idle_seconds = time.monotonic() - last_completed_at
                        if analysis_stall_timeout_seconds and idle_seconds >= analysis_stall_timeout_seconds:
                            for future in pending_futures:
                                future.cancel()
                            raise ExportError(
                                message=(
                                    f"版面分析超过 {int(analysis_stall_timeout_seconds)} 秒没有任何页面完成，"
                                    f"可能卡在外部解析或背景修复服务。未完成页: {preview}"
                                ),
                                error_type='layout_analysis',
                                details={
                                    'completed_pages': completed_count,
                                    'total_pages': total_pages,
                                    'pending_pages': pending_pages,
                                    'timeout_seconds': analysis_stall_timeout_seconds,
                                }
                            )
                        continue

                    for future in done_futures:
                        idx = futures[future]
                        try:
                            results[idx] = future.result()
                            completed_count += 1
                            last_completed_at = time.monotonic()
                            # 版面分析占 5% - 40% 的进度
                            percent = 5 + int(35 * completed_count / total_pages)
                            report_progress("版面分析", f"已完成第 {completed_count}/{total_pages} 页的版面分析", percent)
                        except ExportError:
                            raise
                        except Exception as e:
                            logger.error(f"处理第 {idx + 1} 页图片 {image_paths[idx]} 失败: {e}")
                            raise ExportError(
                                message=f"第 {idx + 1} 页版面分析失败: {e}",
                                error_type='layout_analysis',
                                details={'page': idx + 1, 'image_path': image_paths[idx]}
                            ) from e
            finally:
                executor.shutdown(wait=False, cancel_futures=True)

            editable_images = results
        
        # 2.5. 使用混合策略提取所有文本元素的样式（如果提供了提取器）
        # 混合策略：全局识别（粗体/斜体/下划线/对齐）+ 单个裁剪识别（颜色）
        text_styles_cache = {}
        if text_attribute_extractor:
            report_progress("样式提取", "开始提取文本样式（混合策略）...", 45)
            
            # 统计文本元素数量
            total_text_count = sum(
                len(ExportService._collect_text_elements_for_extraction(img.elements))
                for img in editable_images
            )

            if total_text_count > 0:
                report_progress("样式提取", f"混合策略分析 {total_text_count} 个文本元素...", 50)
                try:
                    text_styles_cache, failed_extractions = ExportService._batch_extract_text_styles_hybrid(
                        editable_images=editable_images,
                        text_attribute_extractor=text_attribute_extractor,
                        max_workers=max_workers * 2,
                        fail_fast=fail_fast
                    )
                except ExportError as e:
                    if e.error_type != 'style_extraction':
                        raise
                    logger.warning(f"样式提取失败，继续导出无样式PPTX: {e.message}")
                    text_styles_cache = {}
                    failed_extractions = [("all", e.message)]
                    report_progress("样式提取", "样式提取失败，已降级为默认文本样式继续导出", 70)

                # 记录样式提取失败的元素（详细）
                for element_id, reason in failed_extractions:
                    warnings.add_style_extraction_failed(element_id, reason)
                
                # 记录汇总信息
                extracted_count = len(text_styles_cache)
                failed_count = len(failed_extractions)
                if failed_count > 0:
                    logger.warning(f"样式提取: {failed_count}/{total_text_count} 个元素失败")
                
                report_progress("样式提取", f"✓ 完成 {extracted_count}/{total_text_count} 个文本样式提取（{failed_count} 个失败）", 70)
        
        report_progress("构建PPTX", "开始构建可编辑PPTX文件...", 75)
        
        # 4. 创建PPTX构建器
        builder = PPTXBuilder()
        builder.create_presentation()
        builder.setup_presentation_size(slide_width_pixels, slide_height_pixels)

        artifacts_dir = ExportService._editable_rebuild_artifacts_dir(output_file)
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        warnings.rebuild_artifacts_dir = str(artifacts_dir)
        
        # 5. 为每个页面构建幻灯片
        total_pages = len(editable_images)
        for page_idx, editable_img in enumerate(editable_images):
            # 构建PPTX占 75% - 95% 的进度
            percent = 75 + int(20 * page_idx / total_pages)
            report_progress("构建PPTX", f"构建第 {page_idx + 1}/{total_pages} 页...", percent)
            logger.info(f"  构建第 {page_idx + 1}/{total_pages} 页...")
            
            # 创建空白幻灯片
            slide = builder.add_blank_slide()
            page_artifacts_dir = artifacts_dir / f"page_{page_idx + 1:03d}"

            has_external_background = bool(
                editable_img.clean_background
                and os.path.exists(editable_img.clean_background)
            )
            background_source = editable_img.clean_background if has_external_background else editable_img.image_path
            background_path = background_source
            if not has_external_background:
                background_path = ExportService._create_local_clean_background(
                    background_source,
                    editable_img.elements,
                    output_path=str(page_artifacts_dir / "clean_background.png"),
                ) or background_source
            page_manifest = ExportService._build_page_rebuild_manifest(
                editable_img=editable_img,
                page_idx=page_idx,
                background_source=background_source,
                background_path=background_path,
                high_fidelity_editable=export_high_fidelity_editable,
            )
            logger.info(f"    使用背景: {background_path}")
            background_added = False
            try:
                slide.shapes.add_picture(
                    background_path,
                    left=0,
                    top=0,
                    width=builder.prs.slide_width,
                    height=builder.prs.slide_height
                )
                background_added = True
            except Exception as e:
                logger.error(f"Failed to add background: {e}")
            
            # 添加所有元素（递归地）
            # 计算缩放比例：将原始图片坐标映射到统一的幻灯片坐标
            # 背景图已经缩放到幻灯片尺寸，所以元素坐标也需要相应缩放
            scale_x = slide_width_pixels / editable_img.width
            scale_y = slide_height_pixels / editable_img.height
            logger.info(f"    元素数量: {len(editable_img.elements)}, 图片尺寸: {editable_img.width}x{editable_img.height}, "
                       f"幻灯片尺寸: {slide_width_pixels}x{slide_height_pixels}, 缩放比例: {scale_x:.3f}x{scale_y:.3f}")
            
            # 高保真模式：前景资产分离（asset-sheet）
            separated_assets = ExportService._run_asset_sheet_separation(
                editable_img=editable_img,
                output_dir=artifacts_dir / f"page_{page_idx + 1:03d}",
                high_fidelity_editable=export_high_fidelity_editable,
                image_editing_provider=image_editing_provider,
                warnings=warnings,
            )
            if separated_assets:
                ExportService._apply_separated_assets(editable_img.elements, separated_assets)
                page_manifest['page_strategy']['asset_sheet_separation'] = 'completed'
                for item in page_manifest['asset_provenance']:
                    source_id = next(
                        (image['id'] for image in page_manifest['images'] if image['path'] == item['path']),
                        None,
                    )
                    if source_id in separated_assets:
                        item['path'] = separated_assets[source_id]
                        item['source'] = separated_assets[source_id]
                        item['source_type'] = 'asset-sheet-separated'
                for item in page_manifest['images']:
                    if item['id'] in separated_assets:
                        item['path'] = separated_assets[item['id']]
                for item in page_manifest['visual_inventory']:
                    if item['id'] in separated_assets:
                        item['source'] = separated_assets[item['id']]
            elif export_high_fidelity_editable:
                page_manifest['page_strategy']['asset_sheet_separation'] = 'not_completed'

            foreground_shape_start = len(slide.shapes)
            ExportService._add_editable_elements_to_slide(
                builder=builder,
                slide=slide,
                elements=editable_img.elements,
                scale_x=scale_x,
                scale_y=scale_y,
                depth=0,
                text_styles_cache=text_styles_cache,
                text_hint_font_sizes=ExportService._text_hint_font_sizes(editable_img.elements),
                warnings=warnings,
                fail_fast=fail_fast
            )
            foreground_shape_count = len(slide.shapes) - foreground_shape_start
            page_manifest['render_result'] = {
                'background_added': background_added,
                'foreground_shape_count': foreground_shape_count,
                'total_shape_count': len(slide.shapes),
            }
            page_manifest['quality_checks']['background_strategy_checked'] = background_added
            page_manifest['quality_checks']['visual_inventory_matched'] = (
                foreground_shape_count > 0
                if page_manifest['text_boxes'] or page_manifest['images']
                else True
            )
            page_validation = ExportService._validate_page_rebuild_manifest(page_manifest)
            ExportService._write_page_rebuild_artifacts(
                artifacts_dir,
                page_idx,
                page_manifest,
                page_validation,
            )
            if not page_validation['passed']:
                message = f"第 {page_idx + 1} 页可编辑重建校验失败: {'; '.join(page_validation['errors'])}"
                if fail_fast:
                    raise ExportError(
                        message=message,
                        error_type='rebuild_validation',
                        details={'page': page_idx + 1, 'validation': page_validation}
                    )
                warnings.add_warning(message)

            logger.info(f"    ✓ 第 {page_idx + 1} 页完成，添加了 {len(editable_img.elements)} 个元素")
        
        # 5. 保存或返回字节流
        report_progress("保存文件", "正在保存PPTX文件...", 95)
        if output_file:
            builder.save(output_file)
            ExportService._validate_pptx_package(output_file)
            report_progress("完成", f"✓ 可编辑PPTX已保存", 100)
            logger.info(f"✓ 可编辑PPTX已保存: {output_file}")
            
            # 输出警告摘要
            if warnings.has_warnings():
                logger.warning(f"导出完成，但有 {len(warnings.to_summary())} 条警告")
            
            return None, warnings
        else:
            pptx_bytes = builder.to_bytes()
            ExportService._validate_pptx_package(pptx_bytes)
            report_progress("完成", f"✓ 可编辑PPTX已生成", 100)
            logger.info(f"✓ 可编辑PPTX已生成（{len(pptx_bytes)} 字节）")
            
            # 输出警告摘要
            if warnings.has_warnings():
                logger.warning(f"导出完成，但有 {len(warnings.to_summary())} 条警告")
            
            return pptx_bytes, warnings
    
    @staticmethod
    def _add_editable_elements_to_slide(
        builder,
        slide,
        elements: List,  # List[EditableElement]
        scale_x: float = 1.0,
        scale_y: float = 1.0,
        depth: int = 0,
        text_styles_cache: Dict[str, Any] = None,  # 预提取的文本样式缓存，key为element_id
        text_hint_font_sizes: Dict[str, int] = None,
        warnings: 'ExportWarnings' = None,  # 警告收集器
        fail_fast: bool = False  # 是否在遇到错误时立即停止
    ):
        """
        递归地将EditableElement添加到幻灯片
        
        Args:
            builder: PPTXBuilder实例
            slide: 幻灯片对象
            elements: EditableElement列表
            scale_x: X轴缩放因子
            scale_y: Y轴缩放因子
            depth: 当前递归深度
            text_styles_cache: 预提取的文本样式缓存（可选），由 _batch_extract_text_styles 生成
        
        Note:
            elem.image_path 现在是绝对路径，无需额外的目录参数
        """
        if text_styles_cache is None:
            text_styles_cache = {}
        if text_hint_font_sizes is None:
            text_hint_font_sizes = {}

        def choose_formula_text(text: str, text_style: Any = None) -> Optional[str]:
            candidates = [text]
            if text_style and getattr(text_style, 'colored_segments', None):
                styled_text = ''.join(seg.text for seg in text_style.colored_segments).strip()
                if styled_text and styled_text not in candidates:
                    candidates.append(styled_text)

            def score(candidate: str) -> int:
                if not looks_like_latex_math(candidate):
                    return -1
                return (
                    len(re.findall(r"\\[A-Za-z]+", candidate)) * 10
                    + candidate.count("\\") * 4
                    + len(re.findall(r"[_^]\s*(?:\{[^{}]+\}|[A-Za-z0-9+\-=()*])", candidate)) * 3
                    + len(re.findall(r"[∀∃∈∉≤≥≠≈∑∏∫∞∂∇πΠΣ√]", candidate)) * 2
                    - len(re.findall(r"\b[A-Za-z]{5,}\b", candidate)) * 2
                )

            scored = [(score(candidate), candidate) for candidate in candidates if candidate]
            scored = [item for item in scored if item[0] >= 0]
            if not scored:
                return None
            return max(scored, key=lambda item: item[0])[1]

        def add_text_or_formula(elem, text, bbox_list, text_level='default', align='left'):
            text_style = text_styles_cache.get(elem.element_id)
            font_size_override = text_hint_font_sizes.get(elem.element_id)
            if text_style:
                logger.debug(f"{'  ' * depth}  使用缓存的文字样式: color={text_style.font_color_rgb}, bold={text_style.is_bold}")

            formula_text = choose_formula_text(text, text_style)
            if formula_text:
                if builder.add_math_element(
                    slide=slide,
                    latex=formula_text,
                    bbox=bbox_list,
                    text_style=text_style
                ):
                    return

                fallback_text = latex_to_display_text(formula_text)
                builder.add_text_element(
                    slide=slide,
                    text=fallback_text,
                    bbox=bbox_list,
                    text_level=text_level,
                    align=align,
                    text_style=text_style,
                    allow_math_conversion=False,
                    font_size_override=font_size_override
                )
                if warnings:
                    warnings.add_text_render_failed(
                        formula_text,
                        '公式暂不支持原生转换，已使用可读文本回退'
                    )
                return

            builder.add_text_element(
                slide=slide,
                text=text,
                bbox=bbox_list,
                text_level=text_level,
                align=align,
                text_style=text_style,
                font_size_override=font_size_override
            )
        
        for elem in elements:
            elem_type = elem.element_type
            
            # 根据深度决定使用局部坐标还是全局坐标
            # depth=0: 顶层元素，使用局部坐标（bbox）
            # depth>0: 子元素，需要使用全局坐标（bbox_global）
            if depth == 0:
                bbox = elem.bbox  # 顶层元素使用局部坐标
            else:
                bbox = elem.bbox_global if hasattr(elem, 'bbox_global') and elem.bbox_global else elem.bbox
            
            # 转换BBox对象为列表并应用缩放
            bbox_list = [
                int(bbox.x0 * scale_x),
                int(bbox.y0 * scale_y),
                int(bbox.x1 * scale_x),
                int(bbox.y1 * scale_y)
            ]
            
            logger.info(f"{'  ' * depth}  添加元素: type={elem_type}, bbox={bbox_list}, content={elem.content[:30] if elem.content else None}, image_path={elem.image_path}, 使用{'全局' if depth > 0 else '局部'}坐标")

            # 根据类型添加元素（参考原实现的_add_mineru_text_to_slide和_add_mineru_image_to_slide）
            if elem_type in ['text', 'title', 'list', 'paragraph', 'header', 'footer', 'heading', 'table_caption', 'image_caption', 'equation', 'interline_equation', 'inline_equation']:
                # 添加文本（参考_add_mineru_text_to_slide）
                if elem.content:
                    text = elem.content.strip()
                    if text:
                        try:
                            # 确定文本级别
                            level = 'title' if elem_type in ['title', 'heading'] else 'default'

                            add_text_or_formula(elem, text, bbox_list, text_level=level)
                        except Exception as e:
                            logger.warning(f"添加文本元素失败: {e}")
                            if fail_fast:
                                raise ExportError(
                                    message=f"添加文本元素失败: {str(e)}",
                                    error_type='text_render',
                                    details={'text': text[:50], 'bbox': bbox_list}
                                )
                            if warnings:
                                warnings.add_text_render_failed(text, str(e))
            
            elif elem_type == 'table_cell':
                # 添加表格单元格（带边框的文本框）
                if elem.content:
                    text = elem.content.strip()
                    if text:
                        try:
                            # 表格单元格已经在上面统一处理了bbox_global和缩放
                            # 直接使用bbox_list即可
                            add_text_or_formula(
                                elem,
                                text,
                                bbox_list,
                                text_level=None,
                                align='center'
                            )

                        except Exception as e:
                            logger.warning(f"添加单元格失败: {e}")
                            if fail_fast:
                                raise ExportError(
                                    message=f"添加表格单元格失败: {str(e)}",
                                    error_type='text_render',
                                    details={'text': text[:50], 'bbox': bbox_list}
                                )
                            if warnings:
                                warnings.add_text_render_failed(text, str(e))
            
            elif elem_type == 'table':
                # 如果表格有子元素（单元格），使用inpainted背景 + 单元格
                if elem.children and elem.inpainted_background_path:
                    logger.info(f"{'  ' * depth}    表格有 {len(elem.children)} 个单元格，使用可编辑格式")
                    
                    # 先添加inpainted背景（干净的表格框架）
                    if os.path.exists(elem.inpainted_background_path):
                        try:
                            builder.add_image_element(
                                slide=slide,
                                image_path=elem.inpainted_background_path,
                                bbox=bbox_list
                            )
                        except Exception as e:
                            logger.error(f"Failed to add table background: {e}")
                    
                    # 递归添加单元格
                    ExportService._add_editable_elements_to_slide(
                        builder=builder,
                        slide=slide,
                        elements=elem.children,
                        scale_x=scale_x,
                        scale_y=scale_y,
                        depth=depth + 1,
                        text_styles_cache=text_styles_cache,
                        text_hint_font_sizes=text_hint_font_sizes,
                        warnings=warnings,
                        fail_fast=fail_fast
                    )
                else:
                    # 没有子元素，添加整体表格图片
                    # elem.image_path 现在是绝对路径
                    if elem.image_path and os.path.exists(elem.image_path):
                        try:
                            builder.add_image_element(
                                slide=slide,
                                image_path=elem.image_path,
                                bbox=bbox_list
                            )
                        except Exception as e:
                            logger.error(f"Failed to add table image: {e}")
                    else:
                        logger.warning(f"Table image not found: {elem.image_path}")
                        builder.add_image_placeholder(slide, bbox_list)
            
            elif elem_type in ['image', 'figure', 'chart']:
                # 检查是否应该使用递归渲染
                should_use_recursive_render = False
                
                if elem.children and elem.inpainted_background_path:
                    # 检查是否有任意子元素占据父元素绝大部分面积
                    parent_area = (bbox.x1 - bbox.x0) * (bbox.y1 - bbox.y0)
                    max_child_coverage_ratio = 0.85  # 阈值
                    has_dominant_child = False
                    
                    for child in elem.children:
                        if hasattr(child, 'bbox_global') and child.bbox_global:
                            child_bbox = child.bbox_global
                        else:
                            child_bbox = child.bbox
                        
                        child_area = child_bbox.area
                        coverage_ratio = child_area / parent_area if parent_area > 0 else 0
                        
                        if coverage_ratio > max_child_coverage_ratio:
                            logger.info(f"{'  ' * depth}    子元素 {child.element_id} 占父元素面积 {coverage_ratio*100:.1f}% (>{max_child_coverage_ratio*100:.0f}%)，跳过递归渲染，直接使用原图")
                            has_dominant_child = True
                            break
                    
                    should_use_recursive_render = not has_dominant_child
                
                # 如果有子元素且应该递归渲染
                if should_use_recursive_render:
                    logger.debug(f"{'  ' * depth}    元素有 {len(elem.children)} 个子元素，递归添加")
                    
                    # 先添加inpainted背景
                    if os.path.exists(elem.inpainted_background_path):
                        try:
                            builder.add_image_element(slide, elem.inpainted_background_path, bbox_list)
                        except Exception as e:
                            logger.error(f"Failed to add inpainted background: {e}")
                    
                    # 递归添加子元素
                    ExportService._add_editable_elements_to_slide(
                        builder=builder,
                        slide=slide,
                        elements=elem.children,
                        scale_x=scale_x,
                        scale_y=scale_y,
                        depth=depth + 1,
                        text_styles_cache=text_styles_cache,
                        text_hint_font_sizes=text_hint_font_sizes,
                        warnings=warnings,
                        fail_fast=fail_fast
                    )
                else:
                    # 没有子元素或子元素占比过大，直接添加原图
                    # elem.image_path 现在是绝对路径
                    if elem.image_path and os.path.exists(elem.image_path):
                        try:
                            builder.add_image_element(
                                slide=slide,
                                image_path=elem.image_path,
                                bbox=bbox_list
                            )
                        except Exception as e:
                            logger.error(f"Failed to add image: {e}")
                    else:
                        logger.warning(f"Image file not found: {elem.image_path}")
                        builder.add_image_placeholder(slide, bbox_list)
            
            else:
                # 其他类型
                logger.debug(f"{'  ' * depth}  跳过未知类型: {elem_type}")
    
