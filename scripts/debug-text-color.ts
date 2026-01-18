import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import JSZip from 'jszip';

async function main() {
  const pptxData = fs.readFileSync('/Users/stevedrucker/pptimg/test/fixtures/test-presentation.pptx');
  const zip = await JSZip.loadAsync(pptxData);
  const slideXml = await zip.file('ppt/slides/slide13.xml')?.async('string');
  if (!slideXml) {
    console.log('No slide XML');
    return;
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: false,
    parseAttributeValue: false,
    trimValues: true,
  });

  const parsed = parser.parse(slideXml);
  const slide = parsed['p:sld'];
  const spTree = slide['p:cSld']['p:spTree'];
  const shapes = spTree['p:sp'];

  // Find the title shape
  const titleShape = Array.isArray(shapes) ? shapes.find((s: any) => {
    const nvSpPr = s['p:nvSpPr'];
    const nvPr = nvSpPr?.['p:nvPr'];
    const ph = nvPr?.['p:ph'];
    return ph?.['@_type'] === 'title';
  }) : shapes;

  console.log('Title shape found:', !!titleShape);
  if (titleShape) {
    const txBody = titleShape['p:txBody'];
    const lstStyle = txBody['a:lstStyle'];
    const p = txBody['a:p'];
    
    console.log('\nlstStyle:');
    console.log(JSON.stringify(lstStyle, null, 2));
    
    console.log('\nParagraph:');
    console.log(JSON.stringify(p, null, 2));
  }
}

main();
