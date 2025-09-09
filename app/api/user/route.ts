export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { fetcUsers } from '@/app/utils/user-check.js';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  } as Record<string, string>;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(),
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');

  if (!username) {
    return NextResponse.json(
      { error: 'username is required' },
      { status: 400, headers: corsHeaders() },
    );
  }

  try {
    const user = await fetcUsers(username);
    return NextResponse.json({ user }, { status: 200, headers: corsHeaders() });
  } catch (error: unknown) {
    const message = (error as Error)?.message || 'Unknown error';
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders() },
    );
  }
} 