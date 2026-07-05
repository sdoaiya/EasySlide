from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter


OUT_DIR = Path("frontend/public/templates")
FONT_REG = r"C:\Windows\Fonts\msyh.ttc"
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_LIGHT = r"C:\Windows\Fonts\msyhl.ttc"


def font(path: str, size: int):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def hex_to_rgb(value: str):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def blend(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))


def gradient(size, c1, c2, vertical=False):
    w, h = size
    img = Image.new("RGB", size, c1)
    pix = img.load()
    for y in range(h):
        for x in range(w):
            t = y / (h - 1) if vertical else x / (w - 1)
            pix[x, y] = blend(c1, c2, t)
    return img


def wrap_text(draw, text, fnt, max_width, max_lines=3):
    lines, current = [], ""
    for ch in text:
        trial = current + ch
        if draw.textbbox((0, 0), trial, font=fnt)[2] <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = ch
            if len(lines) >= max_lines - 1:
                break
    if current and len(lines) < max_lines:
        lines.append(current)
    return lines


TEMPLATES = [
    ("warehouseSafety", "仓库作业安全培训", "Warehouse Safety Training", "安全生产 · 风险识别 · 员工培训", ["#123C69", "#0EA5A3", "#F4D35E"], "shield"),
    ("warehouse6s", "仓库6S管理培训", "Warehouse 6S Management", "整理 · 整顿 · 清扫 · 素养", ["#0F766E", "#34D399", "#ECFDF5"], "grid"),
    ("warehouseAnnual", "仓库年终工作总结", "Warehouse Annual Review", "年度复盘 · 目标完成 · 改进计划", ["#1E3A8A", "#60A5FA", "#EFF6FF"], "dashboard"),
    ("smartLogistics", "智能物流仓储方案", "Smart Logistics Warehousing", "数字仓储 · 智能分拣 · 供应链协同", ["#0B1026", "#38BDF8", "#A78BFA"], "tech"),
    ("inventoryProcess", "库存管理流程汇报", "Inventory Process Report", "入库 · 出库 · 盘点 · 周转", ["#14532D", "#84CC16", "#F7FEE7"], "flow"),
    ("inboundInspection", "收货检验入库流程", "Inbound Inspection Flow", "收货检验 · 产品处理 · 流程图", ["#7C2D12", "#FB923C", "#FFF7ED"], "cards"),
    ("hazardStorage", "危化品仓储安全管理", "Hazardous Storage Safety", "制度规范 · 安全红线 · 应急预案", ["#7F1D1D", "#EF4444", "#FEF2F2"], "warning"),
    ("fireTraining", "仓库消防安全培训", "Warehouse Fire Training", "消防知识 · 隐患排查 · 应急演练", ["#991B1B", "#F97316", "#FFF1F2"], "flame"),
    ("inventoryManagement", "仓储库存管理培训", "Warehouse Inventory Training", "库位管理 · 库存准确率 · 成本控制", ["#0F172A", "#22C55E", "#E2E8F0"], "shelves"),
    ("warehouseKpi", "仓库主管KPI述职", "Warehouse KPI Review", "效率指标 · 成本指标 · 团队管理", ["#312E81", "#818CF8", "#EEF2FF"], "chart"),
    ("visualManagement", "现场目视化管理", "Visual Site Management", "看板管理 · 标识规范 · 现场改善", ["#164E63", "#06B6D4", "#ECFEFF"], "kanban"),
    ("equipmentRoute", "立体仓库搬运路线", "Automated Warehouse Route", "自动化设备 · 搬运路径 · 动态流程", ["#374151", "#F59E0B", "#F3F4F6"], "route"),
    ("greenWorkflow", "绿色简约仓库流程图", "Green Warehouse Workflow", "流程分类 · 培训说明 · 责任节点", ["#166534", "#4ADE80", "#F0FDF4"], "flow"),
    ("orangeSummary", "仓库部门工作汇报", "Warehouse Team Summary", "部门总结 · 问题闭环 · 下阶段计划", ["#9A3412", "#FDBA74", "#FFF7ED"], "report"),
    ("blueBusinessReport", "蓝色商务仓储报告", "Blue Business Warehouse Report", "商务分析 · 仓储运营 · 经营复盘", ["#1D4ED8", "#93C5FD", "#EFF6FF"], "business"),
    ("staffTraining", "仓库人员入职培训", "Warehouse Staff Onboarding", "岗位职责 · 操作规范 · 安全须知", ["#334155", "#14B8A6", "#F8FAFC"], "people"),
    ("ecommerceWarehouse", "电商仓储运营方案", "E-commerce Warehouse Ops", "订单履约 · 拣货打包 · 发货效率", ["#6D28D9", "#F472B6", "#FAF5FF"], "commerce"),
    ("coldChainLogistics", "冷链物流仓储方案", "Cold Chain Logistics", "温控仓储 · 配送追踪 · 品质保障", ["#075985", "#67E8F9", "#F0FDFA"], "cold"),
    ("supplyChainDashboard", "供应链数据看板", "Supply Chain Dashboard", "库存周转 · 交付周期 · 数据洞察", ["#111827", "#10B981", "#F9FAFB"], "dashboard"),
    ("productStorage", "产品仓储管理制度", "Product Storage Policy", "制度建设 · 责任分工 · 标准执行", ["#78350F", "#FBBF24", "#FFFBEB"], "document"),
    ("workSummary", "工作总结通用模板", "Work Summary Template", "年度总结 · 月度汇报 · 复盘提升", ["#1E40AF", "#38BDF8", "#F8FAFC"], "report"),
    ("businessPlan", "商业计划书模板", "Business Plan Template", "市场机会 · 商业模式 · 财务预测", ["#111827", "#F59E0B", "#FFF7ED"], "business"),
    ("educationCourseware", "教育培训课件模板", "Education Courseware", "课程目标 · 知识讲解 · 课堂互动", ["#155E75", "#FACC15", "#ECFEFF"], "book"),
    ("enterprisePromo", "企业宣传介绍模板", "Enterprise Profile", "品牌介绍 · 业务版图 · 核心优势", ["#0F172A", "#60A5FA", "#F8FAFC"], "brand"),
    ("marketingPlan", "营销策划方案模板", "Marketing Plan Template", "活动策略 · 渠道规划 · 转化目标", ["#BE123C", "#FB7185", "#FFF1F2"], "megaphone"),
    ("jobCompetition", "岗位竞聘述职模板", "Job Competition Deck", "个人优势 · 岗位认知 · 工作计划", ["#4338CA", "#A5B4FC", "#EEF2FF"], "people"),
    ("thesisDefense", "论文答辩学术模板", "Thesis Defense Template", "研究背景 · 方法模型 · 结论展望", ["#0F766E", "#99F6E4", "#F0FDFA"], "academic"),
    ("medicalNursing", "医学护理汇报模板", "Medical Nursing Report", "病例分析 · 护理方案 · 数据统计", ["#0E7490", "#67E8F9", "#ECFEFF"], "medical"),
    ("partyBuilding", "党政党建学习模板", "Party Building Template", "理论学习 · 工作部署 · 组织建设", ["#991B1B", "#FBBF24", "#FFFBEB"], "party"),
    ("financeData", "财务数据分析模板", "Finance Data Analysis", "收入结构 · 成本变化 · 利润预测", ["#064E3B", "#34D399", "#ECFDF5"], "chart"),
    ("productLaunch", "产品发布会模板", "Product Launch Deck", "新品亮点 · 场景价值 · 发布节奏", ["#581C87", "#C084FC", "#FAF5FF"], "spotlight"),
    ("resumeProfile", "个人简历作品集模板", "Resume Portfolio Template", "个人简介 · 项目经历 · 能力展示", ["#334155", "#F97316", "#FFF7ED"], "profile"),
]


def draw_template(idx, item):
    key, title, en, subtitle, colors, style = item
    w, h = 1280, 960
    c1, c2, c3 = [hex_to_rgb(c) for c in colors]
    img = gradient((w, h), blend(c1, (255, 255, 255), 0.02), blend(c2, (255, 255, 255), 0.22), vertical=(idx % 2 == 0)).convert("RGBA")
    draw = ImageDraw.Draw(img)

    for i in range(18):
        x = int((i * 173 + idx * 67) % (w + 260)) - 160
        y = int((i * 97 + idx * 91) % (h + 220)) - 120
        r = 80 + (i * 23 + idx * 7) % 180
        col = c3 if i % 3 == 0 else c2
        alpha = 22 if i % 2 else 34
        draw.ellipse((x, y, x + r * 2, y + r * 2), fill=(*col, alpha))

    for i in range(9):
        x = 820 + (i * 41) % 340
        y = 120 + i * 74
        draw.rounded_rectangle((x, y, x + 360, y + 42), radius=21, fill=(*c3, 28), outline=(*c3, 48), width=2)

    card = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    if idx % 3 == 0:
        cd.rounded_rectangle((72, 92, 1208, 850), radius=44, fill=(255, 255, 255, 232), outline=(*c3, 130), width=3)
    else:
        cd.rounded_rectangle((86, 112, 1188, 836), radius=52, fill=(255, 255, 255, 218), outline=(255, 255, 255, 120), width=3)
    img.alpha_composite(card.filter(ImageFilter.GaussianBlur(0.1)))
    draw = ImageDraw.Draw(img)

    dark = c1 if sum(c1) < 420 else (20, 24, 35)
    accent = c2
    f_title = font(FONT_BOLD, 66 if len(title) <= 10 else 58)
    f_sub = font(FONT_REG, 28)
    f_en = font(FONT_LIGHT, 25)
    f_tag = font(FONT_REG, 22)
    f_num = font(FONT_BOLD, 42)

    draw.rounded_rectangle((118, 138, 300, 184), radius=23, fill=(*accent, 230))
    draw.text((146, 145), "PPT TEMPLATE", font=f_tag, fill=(255, 255, 255, 255))
    draw.text((1020, 134), f"{idx:02d}", font=f_num, fill=(*dark, 210))
    draw.line((114, 225, 540, 225), fill=(*accent, 210), width=6)

    y = 284
    for line in wrap_text(draw, title, f_title, 650, 2):
        draw.text((118, y), line, font=f_title, fill=(*dark, 255))
        y += 82
    draw.text((122, y + 8), en.upper(), font=f_en, fill=(*dark, 150))
    draw.text((122, y + 58), subtitle, font=f_sub, fill=(*dark, 205))

    draw_motif(draw, style, 760, 300, c1, c2, c3, dark)

    for j in range(5):
        fill = (*accent, 230) if j == idx % 5 else (*dark, 70)
        draw.rounded_rectangle((122 + j * 34, 776, 142 + j * 34, 796), radius=10, fill=fill)
    draw.text((930, 772), "EasySlide 原创预设", font=f_tag, fill=(*dark, 150))

    rgb = Image.new("RGB", img.size, (255, 255, 255))
    rgb.paste(img, mask=img.split()[-1])
    base = f"template_tuku_{key}"
    rgb.save(OUT_DIR / f"{base}.png", optimize=True)
    rgb.resize((640, 480), Image.Resampling.LANCZOS).save(OUT_DIR / f"{base}-thumb.webp", quality=82, method=6)


def draw_motif(draw, style, ox, oy, c1, accent, c3, dark):
    if style in ("dashboard", "chart"):
        for j, height in enumerate([170, 250, 120, 305, 210]):
            x = ox + j * 72
            draw.rounded_rectangle((x, oy + 320 - height, x + 42, oy + 320), radius=16, fill=(*accent, 230))
        draw.line((ox - 10, oy + 330, ox + 410, oy + 330), fill=(*dark, 110), width=4)
        draw.arc((ox - 20, oy - 60, ox + 390, oy + 350), start=200, end=340, fill=(*c3, 190), width=18)
    elif style in ("flow", "route"):
        points = [(ox, oy + 80), (ox + 170, oy + 80), (ox + 170, oy + 240), (ox + 350, oy + 240)]
        for x, y in points:
            draw.rounded_rectangle((x - 54, y - 38, x + 54, y + 38), radius=20, fill=(*accent, 220))
        draw.line(points, fill=(*dark, 150), width=8, joint="curve")
        draw.polygon([(ox + 350, oy + 240), (ox + 318, oy + 220), (ox + 318, oy + 260)], fill=(*dark, 160))
    elif style in ("warning", "flame", "shield"):
        draw.polygon([(ox + 190, oy - 20), (ox + 390, oy + 340), (ox - 10, oy + 340)], fill=(*accent, 230))
        draw.polygon([(ox + 190, oy + 42), (ox + 325, oy + 300), (ox + 55, oy + 300)], fill=(255, 255, 255, 235))
        draw.text((ox + 168, oy + 145), "!", font=font(FONT_BOLD, 120), fill=(*c1, 255))
    elif style in ("people", "profile"):
        for j in range(3):
            cx = ox + 70 + j * 120
            draw.ellipse((cx - 42, oy + 15, cx + 42, oy + 99), fill=(*accent, 225))
            draw.rounded_rectangle((cx - 70, oy + 120, cx + 70, oy + 286), radius=42, fill=(*c3, 210), outline=(*accent, 160), width=3)
    elif style in ("shelves", "cards", "kanban"):
        for row in range(3):
            for col in range(3):
                x = ox + col * 130
                y = oy + row * 105
                draw.rounded_rectangle((x, y, x + 104, y + 74), radius=18, fill=(*accent, 160 + (row + col) % 2 * 45), outline=(*dark, 60), width=2)
    elif style in ("medical", "academic", "book", "document"):
        draw.rounded_rectangle((ox, oy - 15, ox + 360, oy + 340), radius=30, fill=(255, 255, 255, 245), outline=(*accent, 180), width=5)
        for j in range(6):
            draw.line((ox + 48, oy + 70 + j * 42, ox + 310, oy + 70 + j * 42), fill=(*dark, 80), width=5)
        draw.rounded_rectangle((ox + 48, oy + 40, ox + 170, oy + 82), radius=12, fill=(*accent, 220))
    elif style in ("commerce", "megaphone", "brand", "business", "spotlight"):
        draw.rounded_rectangle((ox + 35, oy + 35, ox + 360, oy + 300), radius=38, fill=(*accent, 225))
        draw.polygon([(ox + 120, oy + 180), (ox + 420, oy + 90), (ox + 420, oy + 270)], fill=(*c3, 230))
        draw.ellipse((ox + 70, oy + 95, ox + 215, oy + 240), fill=(255, 255, 255, 235))
    elif style == "party":
        draw.polygon([(ox + 190, oy - 30), (ox + 235, oy + 105), (ox + 380, oy + 105), (ox + 262, oy + 185), (ox + 308, oy + 330), (ox + 190, oy + 242), (ox + 72, oy + 330), (ox + 118, oy + 185), (ox, oy + 105), (ox + 145, oy + 105)], fill=(*accent, 230))
    elif style == "cold":
        for a in range(0, 180, 30):
            x1 = ox + 190 + math.cos(math.radians(a)) * 170
            y1 = oy + 160 + math.sin(math.radians(a)) * 170
            x2 = ox + 190 - math.cos(math.radians(a)) * 170
            y2 = oy + 160 - math.sin(math.radians(a)) * 170
            draw.line((x1, y1, x2, y2), fill=(*accent, 220), width=8)
        draw.ellipse((ox + 150, oy + 120, ox + 230, oy + 200), fill=(*c3, 240))
    else:
        draw.rounded_rectangle((ox, oy, ox + 370, oy + 300), radius=40, fill=(*accent, 215))
        draw.ellipse((ox + 55, oy + 55, ox + 315, oy + 245), outline=(255, 255, 255, 230), width=18)


if __name__ == "__main__":
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for i, template in enumerate(TEMPLATES, start=1):
        draw_template(i, template)
    print(f"generated {len(TEMPLATES)} templates")
