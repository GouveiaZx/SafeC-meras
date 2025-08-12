/**
 * Script para debugar e corrigir o problema da regex HLS
 * O erro 'e+03' sugere problema com a regex que processa o manifesto
 */

// Exemplo de manifesto HLS que pode estar causando o problema
const exampleManifest = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:1234567890
#EXTINF:10.0,
2025-08-11/12/50-40_0.ts
#EXTINF:10.0,
2025-08-11/12/50-41_0.ts
#EXTINF:10.0,
2025-08-11/12/50-42_0.ts
#EXT-X-ENDLIST`;

// Exemplo com notação científica que pode estar causando problema
const problematicManifest = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:1.23e+03
#EXTINF:10.0,
segment_1.23e+03.ts
#EXTINF:10.0,
segment_1.24e+03.ts`;

console.log('=== TESTANDO REGEX ATUAL ===');

// Regex atual do código
const currentRegex = /^(.*\.ts)$/gm;
const baseUrl = '/api/streams/test-stream/hls';
const token = 'test-token';

function testCurrentRegex(manifest, description) {
  console.log(`\n--- ${description} ---`);
  console.log('Manifesto original:');
  console.log(manifest);
  
  let result = manifest.replace(currentRegex, `${baseUrl}/$1?token=${token}`);
  
  console.log('\nResultado após regex:');
  console.log(result);
  
  // Verificar se há URLs problemáticas
  const problematicUrls = result.match(/\/api\/streams\/[^\s]+\/hls\/[^\s]*e\+[^\s]*/g);
  if (problematicUrls) {
    console.log('\n⚠️ URLs PROBLEMÁTICAS ENCONTRADAS:');
    problematicUrls.forEach(url => console.log(`  - ${url}`));
  } else {
    console.log('\n✅ Nenhuma URL problemática encontrada');
  }
}

// Testar com diferentes manifestos
testCurrentRegex(exampleManifest, 'Manifesto Normal');
testCurrentRegex(problematicManifest, 'Manifesto com Notação Científica');

console.log('\n=== TESTANDO REGEX MELHORADA ===');

// Regex melhorada que evita capturar notação científica
function improvedRegexReplace(manifest, baseUrl, token) {
  console.log('\n--- Usando Regex Melhorada ---');
  console.log('Manifesto original:');
  console.log(manifest);
  
  // Regex mais específica que só captura arquivos .ts que são realmente segmentos
  // Evita capturar números em notação científica
  let result = manifest.replace(
    /^([^#\n\r]*\.ts)$/gm, 
    `${baseUrl}/$1?token=${token}`
  );
  
  console.log('\nResultado após regex melhorada:');
  console.log(result);
  
  // Verificar se há URLs problemáticas
  const problematicUrls = result.match(/\/api\/streams\/[^\s]+\/hls\/[^\s]*e\+[^\s]*/g);
  if (problematicUrls) {
    console.log('\n⚠️ URLs PROBLEMÁTICAS ENCONTRADAS:');
    problematicUrls.forEach(url => console.log(`  - ${url}`));
  } else {
    console.log('\n✅ Nenhuma URL problemática encontrada');
  }
  
  return result;
}

// Testar regex melhorada
improvedRegexReplace(exampleManifest, baseUrl, token);
improvedRegexReplace(problematicManifest, baseUrl, token);

console.log('\n=== REGEX AINDA MAIS ROBUSTA ===');

// Versão ainda mais robusta
function robustRegexReplace(manifest, baseUrl, token) {
  console.log('\n--- Usando Regex Robusta ---');
  console.log('Manifesto original:');
  console.log(manifest);
  
  // Substituir apenas linhas que:
  // 1. Não começam com #
  // 2. Terminam com .ts
  // 3. Não contêm caracteres de notação científica (e+, e-, E+, E-)
  let result = manifest.replace(
    /^(?!#)([^\n\r]*(?<!e[+-]\d)\.ts)$/gm, 
    `${baseUrl}/$1?token=${token}`
  );
  
  console.log('\nResultado após regex robusta:');
  console.log(result);
  
  return result;
}

// Testar regex robusta
robustRegexReplace(exampleManifest, baseUrl, token);
robustRegexReplace(problematicManifest, baseUrl, token);

console.log('\n=== ANÁLISE CONCLUÍDA ===');
console.log('Execute este script para identificar o problema da regex HLS');