import { execFileSync } from 'child_process';

export interface ScreenSize {
  width: number;
  height: number;
}

/**
 * Usable area of the primary monitor (screen minus the taskbar), so the browser window fits exactly.
 * Windows: asked from PowerShell. Elsewhere / on failure: 1920x1080.
 * Override with the environment variable PW_SCREEN=1536x816 if the window is still wrong.
 */
export function getScreenSize(): ScreenSize {
  const parse = (s: string): ScreenSize | undefined => {
    const m = /^(\d{3,5})x(\d{3,5})$/.exec(s.trim());
    return m ? { width: Number(m[1]), height: Number(m[2]) } : undefined;
  };

  const cached = parse(process.env.PW_SCREEN || '');
  if (cached) return cached;

  let size: ScreenSize = { width: 1920, height: 1080 };
  if (process.platform === 'win32') {
    try {
      const out = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Add-Type -AssemblyName System.Windows.Forms; $a=[System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea; "$($a.Width)x$($a.Height)"',
        ],
        { encoding: 'utf8', timeout: 8000, windowsHide: true },
      );
      size = parse(out) ?? size;
    } catch {
      /* keep the default */
    }
  }
  process.env.PW_SCREEN = `${size.width}x${size.height}`; // workers reuse it
  return size;
}
