# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for Unika backend
# Run from the backend directory:
#   pyinstaller backend.spec

from PyInstaller.utils.hooks import collect_all, collect_submodules

datas_all    = []
binaries_all = []
hidden_all   = []

# Bundle the Unity C# plugin so UNITY_SETUP works in compiled builds
datas_all += [('../unity-plugin', 'unity-plugin')]

# Collect uvicorn completely (uses dynamic imports for protocols/loops)
for pkg in ('uvicorn', 'fastapi', 'starlette', 'anyio', 'anthropic', 'httpx', 'httpcore'):
    d, b, h = collect_all(pkg)
    datas_all    += d
    binaries_all += b
    hidden_all   += h

# Extra hidden imports known to be needed by uvicorn
hidden_all += [
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.loops.asyncio',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.protocols.websockets.websockets_impl',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'uvicorn.lifespan.off',
    'h11',
    'websockets',
    'click',
    'colorama',
    'email_validator',
]

a = Analysis(
    ['server.py'],
    pathex=['.'],
    binaries=binaries_all,
    datas=datas_all,
    hiddenimports=hidden_all,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'test', 'unittest', 'matplotlib', 'numpy', 'pandas'],
    noarchive=False,
)

pyz = PYZ(a.pure)

# onedir mode: exe + all DLLs/data in a folder — NO temp extraction on launch
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,   # binaries go to COLLECT, not embedded in exe
    name='unika-agent',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    console=True,            # keep console for log visibility
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='unika-agent',      # output folder: dist/unika-agent/
)
