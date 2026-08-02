import React, { useState, useEffect } from 'react';
import { Button, useToast, MaterialSelector } from '@/components/shared';
import { useT } from '@/hooks/useT';
import { getImageUrl, getStaticAssetUrl } from '@/api/client';

// Template 组件自包含翻译
const templateI18n = {
  zh: {
    template: {
      myTemplates: "我的模板", presetTemplates: "预设模板", uploadTemplate: "上传模板",
      deleteTemplate: "删除模板", templateSelected: "已选择",
      saveToLibraryOnUpload: "上传模板时同时保存到我的模板库",
      selectFromMaterials: "从素材库选择", selectAsTemplate: "从素材库选择作为模板",
      cannotDeleteInUse: "当前使用中的模板不能删除，请先取消选择或切换",
      presets: {
        warehouseSafety: "仓库作业安全培训", warehouse6s: "仓库6S管理培训", warehouseAnnual: "仓库年终工作总结",
        smartLogistics: "智能物流仓储方案", inventoryProcess: "库存管理流程汇报", inboundInspection: "收货检验入库流程",
        hazardStorage: "危化品仓储安全管理", fireTraining: "仓库消防安全培训", inventoryManagement: "仓储库存管理培训",
        warehouseKpi: "仓库主管KPI述职", visualManagement: "现场目视化管理", equipmentRoute: "立体仓库搬运路线",
        greenWorkflow: "绿色简约仓库流程图", orangeSummary: "仓库部门工作汇报", blueBusinessReport: "蓝色商务仓储报告",
        staffTraining: "仓库人员入职培训", ecommerceWarehouse: "电商仓储运营方案", coldChainLogistics: "冷链物流仓储方案",
        supplyChainDashboard: "供应链数据看板", productStorage: "产品仓储管理制度", workSummary: "工作总结通用模板",
        businessPlan: "商业计划书模板", educationCourseware: "教育培训课件模板", enterprisePromo: "企业宣传介绍模板",
        marketingPlan: "营销策划方案模板", jobCompetition: "岗位竞聘述职模板", thesisDefense: "论文答辩学术模板",
        medicalNursing: "医学护理汇报模板", partyBuilding: "党政党建学习模板", financeData: "财务数据分析模板",
        productLaunch: "产品发布会模板", resumeProfile: "个人简历作品集模板"
      },
      messages: { uploadSuccess: "模板上传成功", uploadFailed: "模板上传失败", deleteSuccess: "模板已删除", deleteFailed: "删除模板失败" }
    },
    material: { messages: { savedToLibrary: "素材已保存到模板库", selectedAsTemplate: "已从素材库选择作为模板", loadMaterialFailed: "加载素材失败" } }
  },
  en: {
    template: {
      myTemplates: "My Templates", presetTemplates: "Preset Templates", uploadTemplate: "Upload Template",
      deleteTemplate: "Delete Template", templateSelected: "Selected",
      saveToLibraryOnUpload: "Save to my template library when uploading",
      selectFromMaterials: "Select from Materials", selectAsTemplate: "Select from materials as template",
      cannotDeleteInUse: "Cannot delete template in use, please deselect or switch first",
      presets: {
        warehouseSafety: "Warehouse Safety Training", warehouse6s: "Warehouse 6S Management", warehouseAnnual: "Warehouse Annual Review",
        smartLogistics: "Smart Logistics Warehousing", inventoryProcess: "Inventory Process Report", inboundInspection: "Inbound Inspection Flow",
        hazardStorage: "Hazardous Storage Safety", fireTraining: "Warehouse Fire Training", inventoryManagement: "Warehouse Inventory Training",
        warehouseKpi: "Warehouse KPI Review", visualManagement: "Visual Site Management", equipmentRoute: "Automated Warehouse Route",
        greenWorkflow: "Green Warehouse Workflow", orangeSummary: "Warehouse Team Summary", blueBusinessReport: "Blue Business Warehouse Report",
        staffTraining: "Warehouse Staff Onboarding", ecommerceWarehouse: "E-commerce Warehouse Ops", coldChainLogistics: "Cold Chain Logistics",
        supplyChainDashboard: "Supply Chain Dashboard", productStorage: "Product Storage Policy", workSummary: "Work Summary Template",
        businessPlan: "Business Plan Template", educationCourseware: "Education Courseware", enterprisePromo: "Enterprise Profile",
        marketingPlan: "Marketing Plan Template", jobCompetition: "Job Competition Deck", thesisDefense: "Thesis Defense Template",
        medicalNursing: "Medical Nursing Report", partyBuilding: "Party Building Template", financeData: "Finance Data Analysis",
        productLaunch: "Product Launch Deck", resumeProfile: "Resume Portfolio Template"
      },
      messages: { uploadSuccess: "Template uploaded successfully", uploadFailed: "Failed to upload template", deleteSuccess: "Template deleted", deleteFailed: "Failed to delete template" }
    },
    material: { messages: { savedToLibrary: "Material saved to template library", selectedAsTemplate: "Selected from library as template", loadMaterialFailed: "Failed to load materials" } }
  }
};
import { listUserTemplates, uploadUserTemplate, deleteUserTemplate, type UserTemplate } from '@/api/endpoints';
import { materialUrlToFile } from '@/components/shared/MaterialSelector';
import type { Material } from '@/api/endpoints';
import { ImagePlus, Plus, X } from 'lucide-react';
import { GORDEN_TEMPLATE_PACKS, findGordenTemplatePack } from '@/config/gordenTemplatePacks';

const presetTemplateAssets = [
  { id: '1', key: 'warehouseSafety', file: 'template_tuku_warehouseSafety.png' },
  { id: '2', key: 'warehouse6s', file: 'template_tuku_warehouse6s.png' },
  { id: '3', key: 'warehouseAnnual', file: 'template_tuku_warehouseAnnual.png' },
  { id: '4', key: 'smartLogistics', file: 'template_tuku_smartLogistics.png' },
  { id: '5', key: 'inventoryProcess', file: 'template_tuku_inventoryProcess.png' },
  { id: '6', key: 'inboundInspection', file: 'template_tuku_inboundInspection.png' },
  { id: '7', key: 'hazardStorage', file: 'template_tuku_hazardStorage.png' },
  { id: '8', key: 'fireTraining', file: 'template_tuku_fireTraining.png' },
];

const gordenTemplateCategories = [
  { id: 'all', label: '全部', keywords: [] },
  { id: 'business', label: '商务汇报', keywords: ['商务', '汇报', '工作总结', '战略', '咨询', '商业', '大厂'] },
  { id: 'data', label: '数据图表', keywords: ['数据', '图表', '业绩', '可视化', '经营', 'KPI'] },
  { id: 'education', label: '教学培训', keywords: ['教学', '课件', '培训', '少儿'] },
  { id: 'party', label: '党政红色', keywords: ['党政', '红色', '爱国', '青年', '主题教育'] },
  { id: 'academic', label: '论文答辩', keywords: ['开题', '学术', '论文', '答辩', '名校'] },
  { id: 'tech', label: '技术架构', keywords: ['架构', '技术', '系统', '拓扑'] },
  { id: 'operations', label: '运营产品', keywords: ['运营', '产品', '互联网', '私域'] },
  { id: 'competition', label: '竞聘述职', keywords: ['竞聘', '述职', '晋升'] },
];

interface TemplateSelectorProps {
  onSelect: (templateFile: File | null, templateId?: string) => void;
  selectedTemplateId?: string | null;
  selectedPresetTemplateId?: string | null;
  selectedTemplateDetails?: React.ReactNode;
  showUpload?: boolean;
  projectId?: string | null;
  mode?: 'all' | 'preset' | 'mine' | 'material';
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  onSelect,
  selectedTemplateId,
  selectedTemplateDetails,
  showUpload = true,
  projectId,
  mode = 'all',
}) => {
  const t = useT(templateI18n);
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isMaterialSelectorOpen, setIsMaterialSelectorOpen] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [selectedGordenCategory, setSelectedGordenCategory] = useState('all');
  const [showAllGordenTemplates, setShowAllGordenTemplates] = useState(false);
  const { show, ToastContainer } = useToast();

  const gordenTemplates = GORDEN_TEMPLATE_PACKS;
  const selectedGordenTemplate = findGordenTemplatePack(selectedTemplateId);
  const activeGordenCategory = gordenTemplateCategories.find((category) => category.id === selectedGordenCategory) || gordenTemplateCategories[0];
  const visibleGordenTemplates = activeGordenCategory.id === 'all'
    ? gordenTemplates
    : gordenTemplates.filter((template) => {
      const searchable = [template.name, template.style, ...template.tags].join(' ');
      return activeGordenCategory.keywords.some((keyword) => searchable.includes(keyword));
    });
  const shouldLimitGordenTemplates = activeGordenCategory.id === 'all' && !selectedGordenTemplate && !showAllGordenTemplates;
  const displayedGordenTemplates = shouldLimitGordenTemplates ? visibleGordenTemplates.slice(0, 7) : visibleGordenTemplates;

  useEffect(() => {
    if (mode === 'all' || mode === 'mine') {
      loadUserTemplates();
    }
  }, [mode]);

  const loadUserTemplates = async () => {
    setIsLoadingTemplates(true);
    try {
      const response = await listUserTemplates();
      if (response.data?.templates) {
        setUserTemplates(response.data.templates);
      }
    } catch (error: any) {
      console.error('Failed to load user templates:', error);
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        if (showUpload) {
          const response = await uploadUserTemplate(file);
          if (response.data) {
            const template = response.data;
            setUserTemplates(prev => [template, ...prev]);
            onSelect(null, template.template_id);
            show({ message: t('template.messages.uploadSuccess'), type: 'success' });
          }
        } else {
          if (saveToLibrary) {
            const response = await uploadUserTemplate(file);
            if (response.data) {
              const template = response.data;
              setUserTemplates(prev => [template, ...prev]);
              onSelect(file, template.template_id);
              show({ message: t('material.messages.savedToLibrary'), type: 'success' });
            }
          } else {
            onSelect(file);
          }
        }
      } catch (error: any) {
        console.error('Failed to upload template:', error);
        show({ message: t('template.messages.uploadFailed') + ': ' + (error.message || t('common.unknownError')), type: 'error' });
      }
    }
    e.target.value = '';
  };

  const handleSelectUserTemplate = (template: UserTemplate) => {
    onSelect(null, template.template_id);
  };

  const materialSelectButton = (
    <Button
      variant="secondary"
      size="sm"
      icon={<ImagePlus size={16} />}
      onClick={() => setIsMaterialSelectorOpen(true)}
      className="w-full sm:w-auto"
    >
      {t('template.selectAsTemplate')}
    </Button>
  );

  const handleSelectMaterials = async (materials: Material[], saveAsTemplate?: boolean) => {
    if (materials.length === 0) return;
    
    try {
      const file = await materialUrlToFile(materials[0]);
      
      if (saveAsTemplate) {
        const response = await uploadUserTemplate(file);
        if (response.data) {
          const template = response.data;
          setUserTemplates(prev => [template, ...prev]);
          onSelect(file, template.template_id);
          show({ message: t('material.messages.savedToLibrary'), type: 'success' });
        }
      } else {
        onSelect(file);
        show({ message: t('material.messages.selectedAsTemplate'), type: 'success' });
      }
    } catch (error: any) {
      console.error('Failed to load material:', error);
      show({ message: t('material.messages.loadMaterialFailed') + ': ' + (error.message || t('common.unknownError')), type: 'error' });
    }
  };

  const handleDeleteUserTemplate = async (template: UserTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedTemplateId === template.template_id) {
      show({ message: t('template.cannotDeleteInUse'), type: 'info' });
      return;
    }
    setDeletingTemplateId(template.template_id);
    try {
      await deleteUserTemplate(template.template_id);
      setUserTemplates((prev) => prev.filter((t) => t.template_id !== template.template_id));
      show({ message: t('template.messages.deleteSuccess'), type: 'success' });
    } catch (error: any) {
      console.error('Failed to delete template:', error);
      show({ message: t('template.messages.deleteFailed') + ': ' + (error.message || t('common.unknownError')), type: 'error' });
    } finally {
      setDeletingTemplateId(null);
    }
  };

  return (
    <>
      <div className="space-y-4">
        {(mode === 'all' || mode === 'mine') && userTemplates.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-medium text-[var(--app-text-secondary)]">{t('template.myTemplates')}</h4>
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
              {userTemplates.map((template) => (
                <div
                  key={template.template_id}
                  onClick={() => handleSelectUserTemplate(template)}
                  className={`aspect-[4/3] rounded-[var(--app-radius-card)] border-2 cursor-pointer transition-all relative group ${
                    selectedTemplateId === template.template_id
                      ? 'border-[var(--app-accent)]'
                      : 'border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
                  }`}
                >
                  <img
                    src={getImageUrl(template.thumb_url || template.template_image_url)}
                    alt={template.name || 'Template'}
                    loading="lazy"
                    onError={(event) => {
                      const image = event.currentTarget;
                      if (image.dataset.fallbackUsed || !template.thumb_url) return;
                      image.dataset.fallbackUsed = 'true';
                      image.src = getImageUrl(template.template_image_url);
                    }}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  {selectedTemplateId !== template.template_id && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteUserTemplate(template, e)}
                      disabled={deletingTemplateId === template.template_id}
                      className={`absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-secondary)] opacity-0 shadow-[var(--app-shadow-control)] transition-[opacity,color,background-color] hover:bg-[var(--app-error-soft)] hover:text-[var(--app-error)] group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] ${
                        deletingTemplateId === template.template_id ? 'opacity-60 cursor-not-allowed' : ''
                      }`}
                      aria-label={t('template.deleteTemplate')}
                    >
                      <X size={12} />
                    </button>
                  )}
                  {selectedTemplateId === template.template_id && (
                    <div className="absolute inset-0 bg-[color:var(--app-accent-soft)] flex items-center justify-center pointer-events-none">
                      <span className="text-sm font-semibold text-[var(--app-accent)]">{t('template.templateSelected')}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {(mode === 'all' || mode === 'preset') && (
        <div>
          <div className="mb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1">
              <div>
                <h4 className="text-sm font-semibold text-[var(--app-text)]">预设模板</h4>
                <p className="mt-0.5 text-xs text-[var(--app-text-tertiary)]">系统预设模板，按视觉风格作为图片生成参考</p>
              </div>
              {mode === 'all' && materialSelectButton}
            </div>

            <div className="mb-2 flex flex-wrap gap-1.5">
              {gordenTemplateCategories.map((category) => {
                const selected = selectedGordenCategory === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setSelectedGordenCategory(category.id);
                      setShowAllGordenTemplates(false);
                    }}
                    className={`min-h-8 rounded-[var(--app-radius-control)] border px-3 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? 'border-[var(--app-accent)] bg-[color:var(--app-accent-soft)] text-[var(--app-accent)]'
                        : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-secondary)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)]'
                    }`}
                  >
                    {category.label}
                  </button>
                );
              })}
            </div>

            {selectedGordenTemplate && (
              <div
                role="region"
                aria-label="已选 系统预设模板"
                className="mb-2 rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface-hover)] p-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[var(--app-focus)] px-2 py-0.5 text-[11px] font-semibold text-[var(--app-surface)]">已选模板</span>
                  <span className="text-sm font-semibold text-[var(--app-text)]">{selectedGordenTemplate.name}</span>
                  <span className="text-xs text-[var(--app-text-tertiary)]">{selectedGordenTemplate.pageCount} 页</span>
                  <span className="text-xs text-[var(--app-text-tertiary)]">{selectedGordenTemplate.aspectRatio}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--app-text-secondary)]">{selectedGordenTemplate.style}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {selectedGordenTemplate.colors.map((color) => (
                    <span
                      key={color}
                      className="h-4 w-4 rounded-full border border-[var(--app-surface)] shadow-[var(--app-shadow-control)] ring-1 ring-[var(--app-border)]"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                  {selectedGordenTemplate.tags.map((tag) => (
                    <span key={tag} className="rounded-[var(--app-radius-control)] bg-[var(--app-surface)] px-2 py-0.5 text-[11px] text-[var(--app-text-secondary)]">
                      {tag}
                    </span>
                  ))}
                </div>
                {selectedTemplateDetails}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="group relative flex aspect-[16/9] cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-[var(--app-radius-card)] border border-dashed border-[var(--app-border-strong)] bg-[var(--app-surface-muted)] text-[var(--app-text-tertiary)] transition-colors hover:border-[var(--app-accent)] hover:text-[var(--app-accent)]">
                <Plus size={20} />
                <span className="text-xs font-medium">{t('template.uploadTemplate')}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleTemplateUpload}
                  className="hidden"
                  disabled={isLoadingTemplates}
                />
              </label>
              {displayedGordenTemplates.map((template) => (
                <button
                  type="button"
                  key={template.id}
                  onClick={() => onSelect(null, template.id)}
                  title={`${template.name} · ${template.style}`}
                  className={`group relative aspect-[16/9] overflow-hidden rounded-[var(--app-radius-card)] border-2 text-left transition-colors ${
                    selectedTemplateId === template.id
                      ? 'border-[var(--app-accent)]'
                      : 'border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
                  }`}
                >
                  <img src={template.reference} alt={template.name} className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />
                  <span className={`absolute inset-x-0 bottom-0 border-t px-2.5 py-2 text-xs font-semibold leading-tight ${
                    selectedTemplateId === template.id
                      ? 'border-[var(--app-accent)] bg-[var(--app-accent)] text-[var(--app-surface)]'
                      : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)]'
                  }`}>
                    {template.name}
                  </span>
                  {selectedTemplateId === template.id && (
                    <span className="absolute right-1.5 top-1.5 rounded bg-[var(--app-focus)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--app-surface)]">已选择</span>
                  )}
                </button>
              ))}
            </div>
            {shouldLimitGordenTemplates && visibleGordenTemplates.length > displayedGordenTemplates.length && (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowAllGordenTemplates(true)}
                  className="min-h-8 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-medium text-[var(--app-text-secondary)] transition-colors hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
                >
                  查看全部 {visibleGordenTemplates.length} 个模板
                </button>
              </div>
            )}
          </div>

          {!showUpload && (
            <div className="mt-3 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveToLibrary}
                  onChange={(e) => setSaveToLibrary(e.target.checked)}
                  className="h-4 w-4 rounded accent-[var(--app-accent)]"
                />
                <span className="text-sm text-[var(--app-text-secondary)]">
                  {t('template.saveToLibraryOnUpload')}
                </span>
              </label>
            </div>
          )}
        </div>
        )}

        {mode === 'material' && (
          <div className="mt-4">
            <h4 className="mb-2 text-sm font-medium text-[var(--app-text-secondary)]">{t('template.selectFromMaterials')}</h4>
            {materialSelectButton}
          </div>
        )}
      </div>
      <ToastContainer />
      <MaterialSelector
        projectId={projectId || undefined}
        isOpen={isMaterialSelectorOpen}
        onClose={() => setIsMaterialSelectorOpen(false)}
        onSelect={handleSelectMaterials}
        multiple={false}
        showSaveAsTemplateOption={true}
        mediaKindFilter={['image']}
      />
    </>
  );
};

export const getTemplateFile = async (
  templateId: string,
  userTemplates: UserTemplate[]
): Promise<File | null> => {
  const fetchImageFile = async (url: string, filename: string): Promise<File> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load template image (${response.status})`);
    }

    const blob = await response.blob();
    const contentType = response.headers.get('content-type') || blob.type;
    if (contentType && !contentType.toLowerCase().startsWith('image/')) {
      throw new Error(`Template response is not an image (${contentType})`);
    }
    if (blob.size === 0) {
      throw new Error('Template image is empty');
    }

    return new File([blob], filename, { type: blob.type || contentType || 'image/png' });
  };

  const presetTemplates = presetTemplateAssets.map((template) => ({
    id: template.id,
    preview: getStaticAssetUrl(`/templates/${template.file}`),
  }));

  const gordenTemplate = findGordenTemplatePack(templateId);
  if (gordenTemplate) {
    try {
      return await fetchImageFile(gordenTemplate.reference, `${gordenTemplate.slug}-reference.webp`);
    } catch (error) {
      console.error('Failed to load system preset template:', error);
      return null;
    }
  }

  const presetTemplate = presetTemplates.find(t => t.id === templateId);
  if (presetTemplate && presetTemplate.preview) {
    try {
      return await fetchImageFile(
        presetTemplate.preview,
        presetTemplate.preview.split('/').pop() || 'template.png'
      );
    } catch (error) {
      console.error('Failed to load preset template:', error);
      return null;
    }
  }

  const userTemplate = userTemplates.find(t => t.template_id === templateId);
  if (userTemplate) {
    try {
      const imageUrl = getImageUrl(userTemplate.template_image_url);
      return await fetchImageFile(imageUrl, 'template.png');
    } catch (error) {
      console.error('Failed to load user template:', error);
      return null;
    }
  }

  return null;
};
