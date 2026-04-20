"use client";

/**
 * SidebarSkeleton — pulsing placeholder rendered while the sidebar's
 * pipeline data is still being fetched client-side.
 */

function SectionHeader() {
  return (
    <div className="px-3 pt-4 pb-2">
      <div className="h-2.5 w-16 skeleton-shimmer rounded-full" />
    </div>
  );
}

function Row() {
  return (
    <div className="h-9 flex items-center gap-2.5 pl-3 pr-2">
      <div className="w-4 h-4 skeleton-shimmer rounded-sm" />
      <div className="h-2.5 flex-1 max-w-[140px] skeleton-shimmer rounded-full" />
      <div className="w-6 h-3 skeleton-shimmer rounded-full" />
    </div>
  );
}

export function SidebarSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <SectionHeader />
        <Row />
        <Row />
        <Row />
        <SectionHeader />
        <Row />
        <Row />
        <Row />
        <SectionHeader />
        <Row />
        <Row />
        <Row />
        <Row />
      </div>
      <div className="h-12 border-t border-border-primary" />
    </div>
  );
}
