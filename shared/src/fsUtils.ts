import { promises as fs } from 'fs';
import { dirname } from 'path';
import { createHash } from 'crypto';

export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Directory might already exist, which is fine
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

export async function atomicWrite(filePath: string, content: string): Promise<void> {
  await ensureDir(dirname(filePath));
  
  const tempPath = `${filePath}.tmp.${Date.now()}.${createHash('md5').update(content).digest('hex').slice(0, 8)}`;
  
  try {
    await fs.writeFile(tempPath, content, 'utf8');
    await fs.rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

export async function safeAppend(filePath: string, line: string): Promise<number> {
  await ensureDir(dirname(filePath));
  
  // Ensure line ends with newline
  const lineToAppend = line.endsWith('\n') ? line : line + '\n';
  
  try {
    await fs.appendFile(filePath, lineToAppend, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist, create it
      await fs.writeFile(filePath, lineToAppend, 'utf8');
    } else {
      throw error;
    }
  }
  
  // Count lines to return line number
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content.split('\n').filter(line => line.length > 0).length;
  } catch {
    return 1; // If we can't read, assume it's the first line
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}