import { Request } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import { errors } from './errors';

/** Parse + validate request body with zod; throws VALIDATION_ERROR. */
export function parse<T extends ZodSchema<any>>(schema: T, data: unknown): z.infer<T> {
  try {
    return schema.parse(data ?? {});
  } catch (e) {
    if (e instanceof ZodError) {
      const details = e.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      throw errors.validation(details[0] ? `${details[0].path}: ${details[0].message}` : 'Validation failed', details);
    }
    throw e;
  }
}

export const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;

export const minorUnits = z.number().int().min(1);
export const currencyCode = z.string().regex(/^[A-Z]{3}$/);
export const countyCode2 = z.string().regex(/^[A-Za-z]{2}$/).transform((s) => s.toUpperCase());
export const pinSchema = z.string().regex(/^\d{4}$/, 'PIN must be 4 digits');
export const emailSchema = z.string().email().transform((s) => s.toLowerCase().trim());
export const passwordSchema = z.string().min(10).max(128);
export const phoneSchema = z.string().min(6).max(24).regex(/^[+0-9().\-\s]+$/);
