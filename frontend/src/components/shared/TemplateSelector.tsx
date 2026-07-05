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
import { ImagePlus, X } from 'lucide-react';

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

interface TemplateSelectorProps {
  onSelect: (templateFile: File | null, templateId?: string) => void;
  selectedTemplateId?: string | null;
  selectedPresetTemplateId?: string | null;
  showUpload?: boolean;
  projectId?: string | null;
  mode?: 'all' | 'preset' | 'mine' | 'material';
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  onSelect,
  selectedTemplateId,
  selectedPresetTemplateId,
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
  const { show, ToastContainer } = useToast();

  const presetTemplates = presetTemplateAssets.map((template) => ({
    id: template.id,
    nameKey: `template.presets.${template.key}`,
    preview: getStaticAssetUrl(`/templates/${template.file}`),
    thumb: getStaticAssetUrl(`/templates/${template.file.replace('.png', '-thumb.webp')}`),
  }));

  useEffect(() => {
    loadUserTemplates();
  }, []);

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

  const handleSelectPresetTemplate = (templateId: string, preview: string) => {
    if (!preview) return;
    onSelect(null, templateId);
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
            <h4 className="text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">{t('template.myTemplates')}</h4>
            <div className="grid grid-cols-4 gap-4 mb-4">
              {userTemplates.map((template) => (
                <div
                  key={template.template_id}
                  onClick={() => handleSelectUserTemplate(template)}
                  className={`aspect-[4/3] rounded-lg border-2 cursor-pointer transition-all relative group ${
                    selectedTemplateId === template.template_id
                      ? 'border-cyan-500 ring-2 ring-cyan-200'
                      : 'border-gray-200 dark:border-border-primary hover:border-cyan-300'
                  }`}
                >
                  <img
                    src={getImageUrl(template.thumb_url || template.template_image_url)}
                    alt={template.name || 'Template'}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {selectedTemplateId !== template.template_id && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteUserTemplate(template, e)}
                      disabled={deletingTemplateId === template.template_id}
                      className={`absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow z-20 opacity-0 group-hover:opacity-100 transition-opacity ${
                        deletingTemplateId === template.template_id ? 'opacity-60 cursor-not-allowed' : ''
                      }`}
                      aria-label={t('template.deleteTemplate')}
                    >
                      <X size={12} />
                    </button>
                  )}
                  {selectedTemplateId === template.template_id && (
                    <div className="absolute inset-0 bg-cyan-500 bg-opacity-20 flex items-center justify-center pointer-events-none">
                      <span className="text-white font-semibold text-sm">{t('template.templateSelected')}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {(mode === 'all' || mode === 'preset') && (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-foreground-secondary">{t('template.presetTemplates')}</h4>
            {mode === 'all' && materialSelectButton}
          </div>
          <div className="grid grid-cols-4 gap-4">
            <label className="aspect-[4/3] rounded-lg border-2 border-dashed border-gray-300 dark:border-border-primary hover:border-cyan-500 cursor-pointer transition-all flex flex-col items-center justify-center gap-2 relative overflow-hidden">
              <span className="text-2xl">+</span>
              <span className="text-sm text-gray-500 dark:text-foreground-tertiary">{t('template.uploadTemplate')}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleTemplateUpload}
                className="hidden"
                disabled={isLoadingTemplates}
              />
            </label>

            {presetTemplates.map((template) => (
              <div
                key={template.id}
                onClick={() => template.preview && handleSelectPresetTemplate(template.id, template.preview)}
                className={`aspect-[4/3] rounded-lg border-2 cursor-pointer transition-all bg-gray-100 dark:bg-background-secondary flex items-center justify-center relative ${
                  selectedPresetTemplateId === template.id
                    ? 'border-cyan-500 ring-2 ring-cyan-200'
                    : 'border-gray-200 dark:border-border-primary hover:border-cyan-500'
                }`}
              >
                {template.preview ? (
                  <>
                    <img
                      src={template.thumb || template.preview}
                      alt={t(template.nameKey)}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    {selectedPresetTemplateId === template.id && (
                      <div className="absolute inset-0 bg-cyan-500 bg-opacity-20 flex items-center justify-center pointer-events-none">
                        <span className="text-white font-semibold text-sm">{t('template.templateSelected')}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-gray-500 dark:text-foreground-tertiary">{t(template.nameKey)}</span>
                )}
              </div>
            ))}
          </div>
          
          {!showUpload && (
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveToLibrary}
                  onChange={(e) => setSaveToLibrary(e.target.checked)}
                  className="w-4 h-4 text-cyan-600 border-gray-300 dark:border-border-primary rounded focus:ring-cyan-500"
                />
                <span className="text-sm text-gray-700 dark:text-foreground-secondary">
                  {t('template.saveToLibraryOnUpload')}
                </span>
              </label>
            </div>
          )}
        </div>
        )}

        {mode === 'material' && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">{t('template.selectFromMaterials')}</h4>
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
