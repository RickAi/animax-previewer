import { useState } from 'react';
import { AnimaXHeader } from './components/AnimaXHeader';
import { AnimaXCanvasArea } from './components/AnimaXCanvasArea';
import { AnimaXSidebar } from './components/AnimaXSidebar';
import { AnimaXAlphaZipConvertModal } from './components/AnimaXAlphaZipConvertModal';
import { AnimaXMappingModal } from './components/AnimaXMappingModal';
import { AnimaXPackageRecordsModal } from './components/AnimaXPackageRecordsModal';
import { AnimaXRepackModal } from './components/AnimaXRepackModal';
import { AnimaXUploadModal } from './components/AnimaXUploadModal';
import { useAppPreferences } from '../../../contexts/AppPreferencesContext';
import { getLocationParam } from '../../../utils/locationParams';
import './AnimaX.css';

const WORKSPACE_COLLAPSED_STORAGE_KEY = 'animax_workspace_collapsed';
type AnimaXLayout = 'full' | 'card';

export const getAnimaXLayoutFromSearch = (search: string): AnimaXLayout => {
  return getLocationParam('layout', search) === 'card' ? 'card' : 'full';
};

export const getAnimaXLayoutFromLocation = (routeSearch: string): AnimaXLayout => {
  return getAnimaXLayoutFromSearch(routeSearch);
};

const readWorkspaceCollapsed = () => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(WORKSPACE_COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

const persistWorkspaceCollapsed = (collapsed: boolean) => {
  try {
    window.localStorage.setItem(WORKSPACE_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
};

const AnimaXContent = () => {
  const { t } = useAppPreferences();
  const location = window.location;
  const layout = getAnimaXLayoutFromLocation(location.search);
  const isCardLayout = layout === 'card';
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(readWorkspaceCollapsed);
  const toggleTitle = workspaceCollapsed
    ? t('animax.workspace.expand')
    : t('animax.workspace.collapse');

  const handleToggleWorkspace = () => {
    setWorkspaceCollapsed((previous) => {
      const next = !previous;
      persistWorkspaceCollapsed(next);
      return next;
    });
  };

  return (
    <div
      className={
        isCardLayout ? 'animax-tool-container animax-card-layout' : 'animax-tool-container'
      }
    >
      <div className="animax-app" id="app">
        <AnimaXHeader layout={layout} />

        <main
          className={[
            'animax-main',
            workspaceCollapsed && !isCardLayout ? 'workspace-collapsed' : '',
            isCardLayout ? 'card-layout' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <AnimaXCanvasArea />
          {isCardLayout ? null : (
            <>
              <button
                type="button"
                className="animax-btn iconBtn animax-workspace-toggle"
                title={toggleTitle}
                aria-label={toggleTitle}
                aria-expanded={!workspaceCollapsed}
                onClick={handleToggleWorkspace}
              >
                <span className="animax-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                    <path
                      d={workspaceCollapsed ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>
            </>
          )}
          {isCardLayout ? null : <AnimaXSidebar layout={layout} />}
        </main>

        <AnimaXAlphaZipConvertModal />
        <AnimaXUploadModal />
        {isCardLayout ? null : (
          <>
            <AnimaXRepackModal />
            <AnimaXPackageRecordsModal />
            <AnimaXMappingModal />
          </>
        )}
      </div>
    </div>
  );
};

const AnimaX = () => {
  return <AnimaXContent />;
};

export default AnimaX;
