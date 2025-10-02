import { NextResponse } from "next/server";
import { getSessionUser, SessionUser } from "@/lib/sessionManager";

export interface ApiError extends Error {
  statusCode?: number;
}

export const API_ERRORS = {
  UNAUTHORIZED: { message: "Unauthorized", status: 401 },
  FORBIDDEN: { message: "Forbidden", status: 403 },
  NOT_FOUND: { message: "Not found", status: 404 },
  BAD_REQUEST: { message: "Bad request", status: 400 },
  INTERNAL_ERROR: { message: "Internal server error", status: 500 },
  SERVICE_UNAVAILABLE: { message: "Service unavailable", status: 503 },
  VALIDATION: { message: "Validation error", status: 400 },
} as const;

export function createApiError(message: string, statusCode: number = 500): ApiError {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  return error;
}

export function withAuth<T extends unknown[]>(
  handler: (user: SessionUser, ...args: T) => Promise<NextResponse>
): (...args: T) => Promise<NextResponse> {
  return async (...args: T): Promise<NextResponse> => {
    try {
      const user = await getSessionUser();

      if (!user) {
        return NextResponse.json(
          { error: API_ERRORS.UNAUTHORIZED.message },
          { status: API_ERRORS.UNAUTHORIZED.status }
        );
      }

      return await handler(user, ...args);
    } catch (error) {
      console.error("API Error:", error);

      if (error instanceof Error && 'statusCode' in error) {
        const apiError = error as ApiError;
        return NextResponse.json(
          { error: apiError.message },
          { status: apiError.statusCode || 500 }
        );
      }

      return NextResponse.json(
        { error: API_ERRORS.INTERNAL_ERROR.message },
        { status: API_ERRORS.INTERNAL_ERROR.status }
      );
    }
  };
}

export function validateRequired<T extends Record<string, unknown>>(
  data: T,
  requiredFields: (keyof T)[]
): { isValid: boolean; missing?: string[] } {
  const missing = requiredFields.filter(field => {
    const value = data[field];
    return value === undefined || value === null || (typeof value === 'string' && !value.trim());
  });

  return missing.length > 0
    ? { isValid: false, missing: missing.map(String) }
    : { isValid: true };
}

export async function handleApiRequest<T extends unknown[]>(
  handler: (...args: T) => Promise<unknown>,
  errorContext: string,
  ...args: T
): Promise<NextResponse> {
  try {
    const result = await handler(...args);
    return NextResponse.json(result);
  } catch (error) {
    console.error(`${errorContext} error:`, error);

    if (error instanceof Error && 'statusCode' in error) {
      const apiError = error as ApiError;
      return NextResponse.json(
        { error: apiError.message },
        { status: apiError.statusCode || 500 }
      );
    }

    return NextResponse.json(
      { error: `Failed to ${errorContext.toLowerCase()}` },
      { status: 500 }
    );
  }
}
