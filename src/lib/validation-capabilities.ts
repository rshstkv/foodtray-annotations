import type { ValidationType } from '@/types/domain'

/**
 * Возможности (capabilities) для каждого типа валидации.
 * Определяет что пользователь может делать в каждом режиме.
 */
export interface ValidationCapabilities {
  // Items
  canCreateItems: boolean
  canDeleteItems: boolean
  canUpdateItems: boolean
  
  // Annotations
  canCreateAnnotations: boolean
  canEditAnnotationsBBox: boolean  // move, resize
  canDeleteAnnotations: boolean
  canToggleOcclusion: boolean
  
  // Bottle specific
  canSetBottleOrientation: boolean
  
  // Display
  showAllItemTypes: boolean  // true только для OCCLUSION
}

/**
 * Получить capabilities для типа валидации.
 * Единое место определения правил - легко поддерживать и расширять.
 */
export function getValidationCapabilities(type: ValidationType): ValidationCapabilities {
  switch (type) {
    case 'FOOD_VALIDATION':
    case 'PLATE_VALIDATION':
    case 'BUZZER_VALIDATION':
      // Полное редактирование: создание/удаление items и annotations
      return {
        canCreateItems: true,
        canDeleteItems: true,
        canUpdateItems: true,
        canCreateAnnotations: true,
        canEditAnnotationsBBox: true,
        canDeleteAnnotations: true,
        canToggleOcclusion: false,  // Только в OCCLUSION_VALIDATION
        canSetBottleOrientation: false,
        showAllItemTypes: false,
      }
    
    case 'BOTTLE_ORIENTATION_VALIDATION':
      // Только установка ориентации бутылки, никакого редактирования bbox
      return {
        canCreateItems: false,
        canDeleteItems: false,
        canUpdateItems: true, // только bottle_orientation
        canCreateAnnotations: false,
        canEditAnnotationsBBox: false,
        canDeleteAnnotations: false,
        canToggleOcclusion: false,
        canSetBottleOrientation: true,
        showAllItemTypes: false,
      }
    
    case 'OCCLUSION_VALIDATION':
      // ТОЛЬКО пометка окклюзий на существующих annotations
      return {
        canCreateItems: false,
        canDeleteItems: false,
        canUpdateItems: false,
        canCreateAnnotations: false,
        canEditAnnotationsBBox: false,
        canDeleteAnnotations: false,
        canToggleOcclusion: true,  // ТОЛЬКО это!
        canSetBottleOrientation: false,
        showAllItemTypes: true,  // показываем все типы items
      }
  }
}

