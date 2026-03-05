import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { BlockRegistry } from '../materials/BlockRegistry.js';

function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function exportJSON(blocks) {
    if (blocks.length === 0) return alert("No blocks to export");
    downloadFile(JSON.stringify(blocks, null, 2), 'voxels.json', 'application/json');
}

export function exportCSV(blocks) {
    if (blocks.length === 0) return alert("No blocks to export");
    let csvContent = "x,y,z,type\n";
    blocks.forEach(b => csvContent += `${b.x},${b.y},${b.z},${b.type}\n`);
    downloadFile(csvContent, 'voxels.csv', 'text/csv');
}

export async function copyToClipboard(blocks) {
    if (blocks.length === 0) return alert("No blocks to copy");
    const text = blocks.map(b => `${b.x},${b.y},${b.z},${b.type}`).join('\n');
    try {
        await navigator.clipboard.writeText(text);
        alert("Copied to clipboard!");
    } catch (err) {
        alert("Failed to copy");
    }
}

function createMeshFromBlocks(blocks) {
    if (blocks.length === 0) return null;
    const baseGeometry = new THREE.BoxGeometry(1, 1, 1);
    const geometries = [];
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        matrix.makeTranslation(b.x, b.y, b.z);
        const blockGeo = baseGeometry.clone();
        blockGeo.applyMatrix4(matrix);
        geometries.push(blockGeo);
    }
    const merged = BufferGeometryUtils.mergeGeometries(geometries, true);
    return new THREE.Mesh(merged, new THREE.MeshBasicMaterial());
}

export function exportOBJ(blocks) {
    const mesh = createMeshFromBlocks(blocks);
    if (!mesh) return alert("No blocks to export");
    const exporter = new OBJExporter();
    const result = exporter.parse(mesh);
    downloadFile(result, 'voxels.obj', 'text/plain');
}

export function exportSTL(blocks) {
    const mesh = createMeshFromBlocks(blocks);
    if (!mesh) return alert("No blocks to export");
    const exporter = new STLExporter();
    const scene = new THREE.Scene();
    scene.add(mesh);
    const result = exporter.parse(scene);
    downloadFile(result, 'voxels.stl', 'text/plain');
}

export function exportMCFunction(blocks) {
    if (blocks.length === 0) return alert("No blocks to export");
    let content = "";
    blocks.forEach(b => {
        let blockName = b.type || 'stone';
        // Simple mapping to minecraft IDs if needed
        if (!blockName.startsWith('minecraft:')) {
            blockName = `minecraft:${blockName}`;
        }
        content += `setblock ~${b.x} ~${b.y} ~${b.z} ${blockName}\n`;
    });
    downloadFile(content, 'voxels.mcfunction', 'text/plain');
}

// Minimalistic NBT Encoder for .schematic (Classic 1.12 format)
export async function exportSchematic(blocks) {
    if (blocks.length === 0) return alert("No blocks to export");
    
    // Calculate bounds
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    blocks.forEach(b => {
        if(b.x < minX) minX = b.x;
        if(b.y < minY) minY = b.y;
        if(b.z < minZ) minZ = b.z;
        if(b.x > maxX) maxX = b.x;
        if(b.y > maxY) maxY = b.y;
        if(b.z > maxZ) maxZ = b.z;
    });

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const length = maxZ - minZ + 1;
    
    const blockArray = new Uint8Array(width * height * length);
    const dataArray = new Uint8Array(width * height * length);
    
    blocks.forEach(b => {
        const x = b.x - minX;
        const y = b.y - minY;
        const z = b.z - minZ;
        const index = (y * length + z) * width + x;
        // In 1.12 schematic: 1 is Stone, default. We use 1 for everything as a fallback.
        let blockId = 1;
        let dataId = 0;
        
        if (b.type === 'dirt') blockId = 3;
        else if (b.type === 'cobblestone') blockId = 4;
        else if (b.type === 'oak_planks') blockId = 5;
        else if (b.type === 'glass') blockId = 20;
        else if (b.type === 'bricks') blockId = 45;
        else if (b.type === 'obsidian') blockId = 49;
        
        blockArray[index] = blockId;
        dataArray[index] = dataId;
    });

    // Extremely basic NBT writer
    const buf = new ArrayBuffer(1024 * 1024 * 5); // 5MB buffer
    const view = new DataView(buf);
    let offset = 0;

    function writeByte(v) { view.setInt8(offset++, v); }
    function writeShort(v) { view.setInt16(offset, v); offset += 2; }
    function writeInt(v) { view.setInt32(offset, v); offset += 4; }
    function writeString(str) {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(str);
        writeShort(bytes.length);
        for (let i = 0; i < bytes.length; i++) writeByte(bytes[i]);
    }
    
    // Root TAG_Compound
    writeByte(10); writeString("Schematic");
    
    writeByte(2); writeString("Width"); writeShort(width);
    writeByte(2); writeString("Height"); writeShort(height);
    writeByte(2); writeString("Length"); writeShort(length);
    writeByte(8); writeString("Materials"); writeString("Alpha");
    
    writeByte(7); writeString("Blocks");
    writeInt(blockArray.length);
    for(let i=0; i<blockArray.length; i++) writeByte(blockArray[i]);
    
    writeByte(7); writeString("Data");
    writeInt(dataArray.length);
    for(let i=0; i<dataArray.length; i++) writeByte(dataArray[i]);
    
    writeByte(9); writeString("Entities"); writeByte(10); writeInt(0); // Empty list of compounds
    writeByte(9); writeString("TileEntities"); writeByte(10); writeInt(0); // Empty list of compounds
    
    writeByte(0); // End TAG_Compound

    const nbtData = new Uint8Array(buf, 0, offset);
    
    // GZIP compression using CompressionStream
    try {
        const cs = new CompressionStream('gzip');
        const writer = cs.writable.getWriter();
        writer.write(nbtData);
        writer.close();
        const response = new Response(cs.readable);
        const compressed = await response.arrayBuffer();
        
        downloadFile(new Uint8Array(compressed), 'voxels.schematic', 'application/x-gzip');
    } catch (e) {
        console.warn("CompressionStream not supported, falling back to uncompressed file (might not work in all editors)", e);
        downloadFile(nbtData, 'voxels.schematic', 'application/octet-stream');
    }
}
