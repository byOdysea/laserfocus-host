import React from 'react';
import WeatherDisplay from '../widgets/WeatherDisplay'; 

interface CanvasWidget {
  id: string;
  widget_name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  props: { [key: string]: any };
}

interface CanvasProps {
  canvasWidgets?: {
    id: string;
    widget_name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    props: any;
  }[];
}

const Canvas: React.FC<CanvasProps> = ({ canvasWidgets = [] }) => {
  console.log("Rendering Canvas with widgets:", canvasWidgets); 

  const renderWidget = (widget: CanvasWidget) => {
    const props = typeof widget.props === 'object' && widget.props !== null ? widget.props : {};

    switch (widget.widget_name) {
      case 'WeatherDisplay':
        return <WeatherDisplay {...props} />;
      default:
        return (
          <div style={{ padding: '10px', border: '1px dashed red', height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
            Unknown Widget: <br />
            {widget.widget_name}
            <pre style={{ fontSize: '10px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {JSON.stringify(props, null, 2)}
            </pre>
          </div>
        );
    }
  };

  return (
    <div className="canvas-container"> 
      {canvasWidgets.map((widget) => (
        <div 
          key={widget.id} 
          className="canvas-widget"
          style={{ left: widget.x, top: widget.y }}
        >
          {renderWidget(widget)}
        </div>
      ))}
    </div>
  );
}

export default Canvas;
