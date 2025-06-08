# Alpha Distribution Guide

## ✅ **Quick Start: Building Alpha Releases**

### Build an Alpha Version
```bash
yarn build-alpha
```

This single command will:
- ✨ Auto-increment to the next alpha version (e.g., `0.0.4-alpha.1`)
- 🔨 Build your app 
- 📦 Create DMG and ZIP files
- 🔄 Restore your original package.json

### Current Alpha Build Ready to Distribute
📦 **`Laserfocus-0.0.4-alpha.1-arm64.dmg`** (104MB) - **Ready for M1/M2 Macs** ✅ **Centralized file loading solution**

---

## 🚀 **Distribution Options**

### Option 1: GitHub Releases (Recommended)
1. Go to your repository: `https://github.com/byOdysea/laserfocus`
2. Click "Releases" → "Create a new release"
3. Tag version: `v0.0.4-alpha.1`
4. ✅ Check "Set as a pre-release"
5. Upload the `.dmg` file
6. Share the release URL with testers

### Option 2: Cloud Storage
- Upload `Laserfocus-0.0.4-alpha.1-arm64.dmg` to:
  - Google Drive, Dropbox, OneDrive
  - WeTransfer, Send Anywhere
- Share the download link

---

## 📋 **For Alpha Testers**

### Installation Steps
1. **Download** the `.dmg` file
2. **Double-click** to mount it
3. **Drag Laserfocus** to Applications folder
4. **Handle macOS Security** (see below)

### ⚠️ macOS Security Warning (Expected)
Since this is an unsigned alpha build, macOS will block it initially:

**Solution 1: Right-click Method**
1. Go to Applications folder
2. **Right-click** on Laserfocus
3. Select **"Open"**
4. Click **"Open"** in the dialog

**Solution 2: System Settings**
1. Try opening the app (it will be blocked)
2. Go to **System Settings > Privacy & Security**
3. Click **"Open Anyway"** next to Laserfocus

---

## 🔄 **Next Alpha Release**

Each time you run `yarn build-alpha`, it will create:
- `0.0.4-alpha.2`
- `0.0.4-alpha.3`
- etc.

---

## 📞 **Support**

For issues, contact: [your-email@example.com]

Include:
- macOS version
- Steps to reproduce
- Screenshots if helpful 