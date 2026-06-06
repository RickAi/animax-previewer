import './AnimaX.css';
import { AnimaXHeader } from './components/AnimaXHeader';
import { AnimaXCanvasArea } from './components/AnimaXCanvasArea';
import { AnimaXSidebar } from './components/AnimaXSidebar';
import { AnimaXAlphaZipConvertModal } from './components/AnimaXAlphaZipConvertModal';
import { AnimaXMappingModal } from './components/AnimaXMappingModal';

const AnimaXContent = () => (
  <div className="animax-tool-container">
    <div className="animax-app" id="app">
      <AnimaXHeader />

      <main className="animax-main">
        <AnimaXCanvasArea />
        <AnimaXSidebar />
      </main>

      <AnimaXAlphaZipConvertModal />
      <AnimaXMappingModal />
    </div>
  </div>
);

const AnimaX = () => {
  return <AnimaXContent />;
};

export default AnimaX;
