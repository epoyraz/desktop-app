/**
 * TabStrip: horizontal tab bar with favicons, title, loading indicator,
 * close button, drag-to-reorder, and new-tab button.
 */

import React, { useCallback, useRef, useState } from 'react';
import type { TabState } from '../../main/tabs/TabManager';

declare const electronAPI: {
  tabs: {
    showContextMenu: (tabId: string) => Promise<void>;
  };
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DRAG_THRESHOLD_PX = 4;

interface TabStripProps {
  tabs: TabState[];
  activeTabId: string | null;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onNewTab: () => void;
  onMove: (tabId: string, toIndex: number) => void;
}

// ---------------------------------------------------------------------------
// Individual tab
// ---------------------------------------------------------------------------
interface TabItemProps {
  tab: TabState;
  index: number;
  isActive: boolean;
  onActivate: () => void;
  onClose: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent, tabId: string, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, toIndex: number) => void;
  isDragOver: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
}

function TabItem({
  tab,
  index,
  isActive,
  onActivate,
  onClose,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
  onContextMenu,
}: TabItemProps): React.ReactElement {
  const isPinned = tab.pinned;
  return (
    <div
      className={[
        'tab-item',
        isActive ? 'tab-item--active' : '',
        isDragOver ? 'tab-item--drag-over' : '',
        isPinned ? 'tab-item--pinned' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="tab"
      aria-selected={isActive}
      tabIndex={0}
      draggable
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onActivate();
      }}
      onDragStart={(e) => onDragStart(e, tab.id, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onContextMenu={onContextMenu}
      title={isPinned ? tab.title : undefined}
    >
      {/* Favicon / loading spinner / audio indicator */}
      <span className="tab-item__favicon" aria-hidden="true">
        {tab.isLoading ? (
          <span className="tab-item__spinner" />
        ) : isPinned && tab.audible ? (
          <svg className="tab-item__audio-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L4.5 5H2v6h2.5L8 14V2z" fill="currentColor" />
            <path d="M11 5.5c.8.8 1.2 1.8 1.2 2.5s-.4 1.7-1.2 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M12.5 3.5C14 5 14.8 6.8 14.8 8s-.8 3-2.3 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        ) : tab.favicon ? (
          <img src={tab.favicon} alt="" width={14} height={14} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <span className="tab-item__favicon-placeholder" />
        )}
      </span>

      {/* Title — hidden for pinned tabs */}
      {!isPinned && (
        <span className="tab-item__title" title={tab.title}>
          {tab.title || 'New Tab'}
        </span>
      )}

      {/* Close button — hidden for pinned tabs */}
      {!isPinned && (
        <button
          type="button"
          className="tab-item__close"
          aria-label={`Close ${tab.title || 'tab'}`}
          onClick={onClose}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M3 3l6 6M9 3l-6 6"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TabStrip
// ---------------------------------------------------------------------------
export function TabStrip({
  tabs,
  activeTabId,
  onActivate,
  onClose,
  onNewTab,
  onMove,
}: TabStripProps): React.ReactElement {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragTabId = useRef<string | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, tabId: string, _index: number) => {
      dragTabId.current = tabId;
      e.dataTransfer.effectAllowed = 'move';
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverIndex(index);
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      setDragOverIndex(null);
      if (dragTabId.current) {
        onMove(dragTabId.current, toIndex);
        dragTabId.current = null;
      }
    },
    [onMove],
  );

  const handleDragEnd = useCallback(() => {
    setDragOverIndex(null);
    dragTabId.current = null;
  }, []);

  return (
    <div className="tab-strip" role="presentation" onDragEnd={handleDragEnd}>
      <div className="tab-strip__tabs" role="tablist" aria-label="Browser tabs">
        {tabs.map((tab, index) => (
          <TabItem
            key={tab.id}
            tab={tab}
            index={index}
            isActive={tab.id === activeTabId}
            onActivate={() => onActivate(tab.id)}
            onClose={(e) => {
              e.stopPropagation();
              onClose(tab.id);
            }}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            isDragOver={dragOverIndex === index}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              electronAPI.tabs.showContextMenu(tab.id);
            }}
          />
        ))}
        {/* + button sits right after the last tab (Chrome-style), not pinned right */}
        <button
          type="button"
          className="tab-strip__new-tab"
          aria-label="New tab"
          onClick={onNewTab}
          title="New Tab (Cmd+T)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M7 3v8M3 7h8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
