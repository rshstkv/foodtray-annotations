import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'

/**
 * GET /api/test-split/catalog?search=agua&product_type=Bebida
 * Search product catalog with optional filters
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    const url = new URL(request.url)
    const search = url.searchParams.get('search') || ''
    const productType = url.searchParams.get('product_type') || ''
    const typesOnly = url.searchParams.get('types_only') === '1'

    if (typesOnly) {
      const { data: allProducts, error } = await supabase
        .from('product_catalog')
        .select('product_type')

      if (error) {
        return apiError('Failed to fetch types', 500, ApiErrorCode.INTERNAL_ERROR)
      }

      const types = [...new Set((allProducts || []).map(p => p.product_type))].sort()
      return apiSuccess({ types })
    }

    let query = supabase
      .from('product_catalog')
      .select('*')
      .order('name')

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    if (productType) {
      query = query.eq('product_type', productType)
    }

    query = query.limit(50)

    const { data, error } = await query

    if (error) {
      console.error('[test-split/catalog] Error:', error)
      return apiError('Failed to search catalog', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    return apiSuccess({ products: data || [] })
  } catch (error) {
    console.error('[test-split/catalog] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}
