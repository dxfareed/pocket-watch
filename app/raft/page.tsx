"use client";

import dynamic from 'next/dynamic';
import React from 'react';

const RaftClientPage = dynamic(
  () => import('./RaftClientPage'), 
  { ssr: false }
);

export default function RaftPage() {
  return <RaftClientPage />;
}