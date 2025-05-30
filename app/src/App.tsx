import "./App.css";

function App() {
  return (
    <div className="retro-container">
      <div className="retro-screen">
        <div className="scan-lines"></div>
        <div className="content">
          <h1 className="retro-title">
            <span className="blink">●</span> LASERFOCUS <span className="blink">●</span>
          </h1>
          <div className="retro-border">
            <p className="retro-text">
              WELCOME TO THE FUTURE
            </p>
            <p className="retro-subtext">
              [SYSTEM INITIALIZED]
            </p>
          </div>
          <div className="retro-footer">
            <span className="cursor-blink">█</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
