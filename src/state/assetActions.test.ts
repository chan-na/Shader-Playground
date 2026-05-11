import { describe, expect, it } from 'vitest';
import { classifyFile } from './assetActions';

const mockFile = (name: string, type = '') =>
  new File([new Uint8Array()], name, { type });

describe('classifyFile', () => {
  it('detects OBJ by extension', () => {
    expect(classifyFile(mockFile('cube.obj'))).toBe('obj');
    expect(classifyFile(mockFile('Cube.OBJ'))).toBe('obj');
  });

  it('detects glTF/glb by extension', () => {
    expect(classifyFile(mockFile('scene.gltf'))).toBe('gltf');
    expect(classifyFile(mockFile('scene.glb'))).toBe('gltf');
  });

  it('detects images by extension', () => {
    expect(classifyFile(mockFile('a.png'))).toBe('image');
    expect(classifyFile(mockFile('a.jpg'))).toBe('image');
    expect(classifyFile(mockFile('a.jpeg'))).toBe('image');
    expect(classifyFile(mockFile('a.webp'))).toBe('image');
  });

  it('detects images by MIME when extension is missing', () => {
    expect(classifyFile(mockFile('photo', 'image/png'))).toBe('image');
  });

  it('returns unknown for unsupported types', () => {
    expect(classifyFile(mockFile('readme.txt'))).toBe('unknown');
    expect(classifyFile(mockFile('script.js'))).toBe('unknown');
  });
});
