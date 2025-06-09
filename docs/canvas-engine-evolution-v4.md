# Canvas Engine Evolution: Agent Autonomy and Canvas Abstraction

## Overview

This document captures the architectural evolution discussion for Canvas Engine v4, focusing on removing hardcoded behaviors, separating agent concerns, and preparing for future canvas implementations beyond desktop environments.

## Current State: Canvas Engine v3

The current Canvas Engine (v3) contains several architectural limitations:

### Hardcoded Guardrails
- Layout calculations that specifically avoid InputPill and AthenaWidget positions
- Predefined layout patterns (side-by-side for 2 windows, top/bottom for 3, etc.)
- Mandatory completion rules forcing agents to follow specific sequences
- Fixed platform component assumptions (InputPill at bottom, AthenaWidget at right)

### Agent Integration Issues
- Canvas Engine contains both window management AND an agent
- The agent is specialized only for tool calling, not conversational
- Gemini model limitations require extensive workarounds and guardrails
- Mixed responsibilities make the system harder to test and evolve

### Desktop-Specific Coupling
- Direct Electron BrowserWindow dependencies
- Desktop-specific terminology throughout the codebase
- Hardcoded screen coordinate systems
- No abstraction for different canvas environments

## Vision for Canvas Engine v4

### Core Architectural Principles

#### 1. Complete Agent Autonomy
- Remove ALL hardcoded layout behaviors from the engine
- Let agents (powered by better models) make their own spatial decisions
- No more guardrails enforcing specific window arrangements
- Engine becomes a pure tool provider with no opinions

#### 2. Single Agent Architecture
- Athena becomes the sole conversational agent
- All user input goes through Athena, whether for canvas operations or conversations
- No separate "canvas commands" vs "Athena chat" - one unified input
- Agent decides when to use canvas tools vs when to just respond

#### 3. Enhanced Desktop Awareness
- Track ALL windows on desktop, not just managed ones
- Provide complete system state to agent (Chrome windows, VS Code, Finder, etc.)
- Real-time monitoring of desktop changes at ~10Hz
- Rich context about processes, window ownership, and relationships

#### 4. Canvas Abstraction (Preparing for v5)
- Abstract away desktop-specific implementations
- Use generic concepts: "elements" on a "canvas" with "transforms"
- Position as coordinate arrays (works for 2D: [x,y], 3D: [x,y,z])
- Size with units (pixels, percent, meters, viewport units)
- State abstraction (visible, focused, interactive, etc.)

## Agent Behavior Expectations

### Efficiency Requirement
Despite being autonomous, Athena must maintain current efficient behavior:

- "open google" → Immediately open google.com in perfectly positioned window
- No unnecessary conversation for simple requests
- Respect platform UI components (InputPill, AthenaWidget) 
- Use smart defaults for positioning and sizing

### Intelligence in Prompts, Not Code
All layout intelligence moves to Athena's system prompts:
- Understanding of desktop layout best practices
- Knowledge of platform component positions
- Awareness of existing window arrangements
- Optimization for user productivity

## Future Canvas Vision (v5+)

### Canvas Type Abstraction
The architecture prepares for multiple canvas implementations:

#### Desktop Canvas (Current)
- 2D coordinate system
- Pixel-based sizing
- Window-based elements
- Screen boundaries

#### VisionOS Canvas (Future)
- 3D coordinate system  
- Meter-based sizing
- Spatial object elements
- Room/space boundaries

#### Web Canvas (Future)
- DOM-based elements
- Viewport-relative positioning
- CSS-based styling
- Browser window boundaries

#### AR Canvas (Future)
- Mixed reality coordinates
- Physical space integration
- Gesture-based interaction
- Real-world anchoring

### Adapter Pattern Implementation
Each canvas type implements a common interface:
- `initializeCanvas()` - Set up canvas environment
- `createElement()` - Add new elements
- `modifyElement()` - Change existing elements  
- `removeElement()` - Remove elements
- `getCanvasState()` - Current state query

## Benefits of v4 Architecture

### For Current Development
1. **Easier Testing** - Canvas operations can be tested without AI
2. **Better Models** - Ready for GPT-4, Claude, or future models
3. **Cleaner Code** - No more Gemini-specific workarounds
4. **True Modularity** - Any agent can use the canvas engine

### For Future Development
1. **Canvas Flexibility** - Easy to swap desktop for VisionOS
2. **Agent Reuse** - Same Athena agent works across canvas types
3. **Rapid Prototyping** - Test new canvas implementations quickly
4. **Cross-Platform** - Abstract concepts work everywhere

## Implementation Strategy

### Phase 1: Strip Current Engine (v4.0)
- Remove all agent/LLM code from Canvas Engine
- Remove hardcoded layout calculations
- Remove prescriptive prompts and guardrails
- Keep only window state tracking and operations

### Phase 2: Add Desktop Monitoring (v4.1)
- Implement system-wide window capture
- Track all processes and windows
- Provide rich desktop state to agents
- Real-time state updates

### Phase 3: Create Athena Agent (v4.2)
- Standalone agent with full autonomy
- Canvas tools among other capabilities
- Intelligent system prompts for efficient behavior
- Conversation and tool-use in one agent

### Phase 4: Abstract Canvas Interface (v4.3)
- Create canvas adapter pattern
- Implement desktop adapter
- Prepare type system for 3D/AR canvases
- Validate abstraction with mock implementations

## Success Criteria

### Functional Requirements
- "open google" still works instantly and positions perfectly
- All current Canvas Engine functionality preserved
- Agent can explain what it's doing when asked
- System handles complex multi-window arrangements

### Architectural Requirements
- Canvas Engine has zero agent code
- No hardcoded layout logic
- Desktop implementation is swappable
- Agent and engine can be tested independently

### Future Readiness
- Canvas abstraction supports 3D coordinates
- Element types are extensible
- New canvas implementations require minimal code
- Agent prompts are canvas-type aware

## Conclusion

Canvas Engine v4 represents a fundamental architectural shift toward true modularity and future flexibility. By removing hardcoded behaviors and separating concerns, we create a system that's both more capable today and ready for tomorrow's canvas environments.

The key insight is that with sufficiently capable models, the engine should provide **capabilities**, not **behaviors**. Intelligence belongs in the agent, not the infrastructure. 