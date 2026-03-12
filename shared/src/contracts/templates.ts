import { z } from 'zod'
import { TemplateCatalogSchema } from '../templates'

export const TemplatesResponseSchema = TemplateCatalogSchema
export type TemplatesResponse = z.infer<typeof TemplatesResponseSchema>
