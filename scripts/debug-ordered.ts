import { PptxParser } from '../dist/core/PptxParser.js';

async function main() {
  const parser = new PptxParser();
  await parser.open('./test/fixtures/test-presentation.pptx');
  
  const count = await parser.getSlideCount();
  console.log(`Found ${count} slides`);
  
  if (count > 0) {
    const slide = await parser.getSlide(0);
    const slidePath = slide.path;
    console.log(`Testing with slide: ${slidePath}`);
    
    const orderedSlide = await parser.readXmlOrdered(slidePath);
    
    console.log('\nTotal elements:', (orderedSlide as any[]).length);
    
    // Look at second element (index 1) which should be p:sld
    const sldElement = (orderedSlide as any[])[1];
    if (sldElement) {
      console.log('\nSecond element keys:', Object.keys(sldElement));
      
      // Check for p:sld
      if (sldElement['p:sld']) {
        console.log('Found p:sld!');
        console.log('p:sld type:', typeof sldElement['p:sld']);
        console.log('p:sld isArray:', Array.isArray(sldElement['p:sld']));
        
        const sldChildren = sldElement['p:sld'];
        if (Array.isArray(sldChildren)) {
          console.log('p:sld children count:', sldChildren.length);
          
          // Look for p:cSld
          for (let i = 0; i < sldChildren.length; i++) {
            const child = sldChildren[i];
            console.log(`\nChild ${i} keys:`, Object.keys(child));
            
            if (child['p:cSld']) {
              console.log('Found p:cSld!');
              const cSldChildren = child['p:cSld'];
              if (Array.isArray(cSldChildren)) {
                console.log('p:cSld children count:', cSldChildren.length);
                
                // Look for p:spTree
                for (let j = 0; j < cSldChildren.length; j++) {
                  const cSldChild = cSldChildren[j];
                  console.log(`  cSld child ${j} keys:`, Object.keys(cSldChild));
                  
                  if (cSldChild['p:spTree']) {
                    console.log('  Found p:spTree!');
                    const spTreeChildren = cSldChild['p:spTree'];
                    if (Array.isArray(spTreeChildren)) {
                      console.log('  p:spTree children count:', spTreeChildren.length);
                      
                      // Show what's in spTree
                      for (let k = 0; k < Math.min(5, spTreeChildren.length); k++) {
                        console.log(`    spTree child ${k} keys:`, Object.keys(spTreeChildren[k]));
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  
  parser.close();
}

main().catch(console.error);
