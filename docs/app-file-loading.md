# App File Loading Solution

## Problem Statement

Previously, each app component (AthenaWidget, Byokwidget, InputPill) had its own custom file loading logic with:
- ❌ **Duplicated code** across all components
- ❌ **Inconsistent error handling** 
- ❌ **Hard to maintain** - changes needed in every file
- ❌ **Not future-proof** - new apps wouldn't get fixes automatically

## Solution: Centralized AppFileLoader

### Architecture

```
src/lib/utils/app-file-loader.ts  ← Centralized utility
├── Development: Vite dev server URLs
├── Production: Multiple fallback paths  
└── Consistent error handling & logging

All apps use: createAppFileLoader(viteDevServerUrl)
```

### Key Benefits

✅ **Single source of truth** for file loading logic  
✅ **Automatic fallback paths** for different packaging scenarios  
✅ **Consistent error handling** with detailed logging  
✅ **Future-proof** - new apps get the solution automatically  
✅ **Maintainable** - change once, fix everywhere  

### Usage Pattern

```typescript
// In any app's main.ts file
import { createAppFileLoader } from '@lib/utils/app-file-loader';

export class MyAppWindow {
    private fileLoader: ReturnType<typeof createAppFileLoader>;
    
    constructor(display: Display, viteDevServerUrl?: string, preloadPath: string) {
        this.fileLoader = createAppFileLoader(viteDevServerUrl);
        // ... other setup
    }
    
    async init(): Promise<void> {
        await this.fileLoader.loadAppHtml(
            this.window, 
            'platform/myapp',  // or 'apps/myapp', 'widgets/myapp' 
            '[MyAppWindow]'
        );
    }
}
```

### Fallback Strategy

The utility tries multiple path structures automatically:

1. **Standard path**: `dist/ui/{componentPath}/src/index.html`
2. **Alternative structure**: `dist/ui/{...componentPath.split('/')}/src/index.html`  
3. **Flattened structure**: `dist/ui/src/ui/{componentPath}/src/index.html`
4. **Direct path**: `dist/{componentPath}/src/index.html`

This handles different electron-builder configurations and packaging scenarios.

### AppGenerator Integration

New apps generated with `yarn create-app` automatically include:
- ✅ **AppFileLoader import**
- ✅ **Proper async init() method**
- ✅ **Centralized file loading call**
- ✅ **Consistent error handling**

### Migration Guide

For existing apps, replace manual loading logic:

```typescript
// OLD - Manual loading with custom fallbacks ❌
if (this.viteDevServerUrl) {
    this.window.loadURL(`${this.viteDevServerUrl}/src/ui/${path}/src/index.html`);
} else {
    const basePath = app.getAppPath();
    const rendererPath = path.join(basePath, `dist/ui/${path}/src/index.html`);
    this.window.loadFile(rendererPath).catch((error) => {
        // Custom fallback logic...
    });
}

// NEW - Centralized utility ✅  
await this.fileLoader.loadAppHtml(this.window, 'platform/myapp', '[MyApp]');
```

### Testing

The solution is production-tested in:
- ✅ AthenaWidget
- ✅ Byokwidget  
- ✅ InputPill
- ✅ Alpha builds (v0.0.4-alpha.1+)

### Future Maintenance

All file loading improvements are now centralized:
1. **Update only** `src/lib/utils/app-file-loader.ts`
2. **All apps benefit** automatically
3. **New apps** get the latest solution via AppGenerator

This eliminates the need to touch individual app files for file loading issues. 