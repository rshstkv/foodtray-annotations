import type { TrayItem } from '@/types/domain'

export interface TestSplitWarning {
  type: 'error' | 'warning' | 'info'
  message: string
}

/**
 * Product-specific validation warnings for test split items.
 * These don't block completion but highlight potential issues.
 */
export function getTestSplitWarnings(item: TrayItem): TestSplitWarning[] {
  const warnings: TestSplitWarning[] = []
  const name = (item.name || item.metadata?.name || '').toUpperCase()
  const productType = (item.product_type || '').toLowerCase()

  if (productType !== 'bebida') return warnings

  const isUp = item.up === true
  const isLabelVisible = item.label_visible === true

  // AGUA SERRA: dummy forbidden
  if (name.includes('ÁGUA SERRA') || name.includes('AGUA SERRA')) {
    // Good - it's already labeled as AGUA SERRA
  } else if (isDummyWater(name)) {
    warnings.push({
      type: 'error',
      message: 'Вода должна быть размечена как AGUA SERRA, dummy запрещён',
    })
  }

  // AGUA SERRA volume check
  if ((name.includes('ÁGUA SERRA') || name.includes('AGUA SERRA')) && name.includes('33CL') && isUp) {
    warnings.push({
      type: 'warning',
      message: 'Вертикальная бутылка воды обычно 50CL, проверьте объём',
    })
  }

  // DAMM ESTRELLA: dummy forbidden
  if (name.includes('DAMM') && name.includes('DUMMY')) {
    warnings.push({
      type: 'error',
      message: 'Пиво DAMM ESTRELLA должно быть конкретным классом, dummy запрещён',
    })
  }

  // DAMM ESTRELLA volume hint
  if (name.includes('DAMM ESTRELLA') && !name.includes('DUMMY') && isUp && name.includes('20')) {
    warnings.push({
      type: 'warning',
      message: 'Вертикальная бутылка DAMM обычно 33CL, проверьте объём',
    })
  }

  // FAISAO: must have specific type (rose/tinto/branco)
  if (name.includes('FAIS') && name.includes('DUMMY')) {
    warnings.push({
      type: 'error',
      message: 'FAISÃO должен быть rosé/tinto/branco, dummy запрещён',
    })
  }

  // Other wines: must be DUMMY
  if (isWine(name) && !name.includes('FAIS') && !name.includes('DUMMY')) {
    warnings.push({
      type: 'warning',
      message: 'Вина (кроме FAISÃO) должны быть DUMMY',
    })
  }

  // FUZE TEA: attention to flavor
  if (name.includes('FUZE TEA') || name.includes('FUZE')) {
    warnings.push({
      type: 'info',
      message: 'Проверьте вкус FUZE TEA — часто встречаются ошибки',
    })
  }

  if (item.up === null || item.up === undefined) {
    warnings.push({
      type: 'warning',
      message: 'Не указано положение бутылки (верт./гориз.)',
    })
  }

  if (item.label_visible === null || item.label_visible === undefined) {
    warnings.push({
      type: 'warning',
      message: 'Не указана видимость этикетки',
    })
  }

  return warnings
}

function isDummyWater(name: string): boolean {
  return (name.includes('DUMMY') || name.includes('RRS VINHOS'))
    && !name.includes('FAIS')
    && !name.includes('DAMM')
    && !name.includes('COCA')
    && !name.includes('PEPSI')
}

function isWine(name: string): boolean {
  return name.includes('VINHO') || name.includes('VINHOS') || name.includes('FAIS')
    || name.includes('ROSÉ') || name.includes('TINTO') || name.includes('BRANCO')
    || name.includes('PANACHÉ') || name.includes('SIDRA')
}
