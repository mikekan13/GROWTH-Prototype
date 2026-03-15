import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getTemplate, saveTemplate, saveTemplateSchema } from '@/services/application';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    void session; // membership checked in service
    const template = await getTemplate(id);
    return NextResponse.json(template);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = saveTemplateSchema.parse(body);
    const result = await saveTemplate(id, session.user.id, session.user.role, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
