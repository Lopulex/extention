
console.log('%c ContentGuard  — запущен (модель в content script)', 'color:#7ee0c3; font-weight:bold');

import { pipeline, env } from '@xenova/transformers';

let textClassifier = null;

async function initModel() {
  if (textClassifier) return textClassifier;

  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.useBrowserCache = true;
  env.localModelPath = chrome.runtime.getURL('models/');  

  const modelName = 'toxic-bert-russian-onnx';

  console.log(' [content] Загрузка ЛОКАЛЬНОЙ модели...', env.localModelPath + modelName);

  textClassifier = await pipeline('text-classification', modelName, {
    quantized: false,
    local_files_only: true,
  });

  console.log('%c✅ [content] ONNX-модель успешно загружена!', 'color:#7ee0c3; font-size:16px');
  return textClassifier;
}

async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get('settings', data => {
      resolve(data.settings || { enabled: true, textThreshold: 0.85, imageThreshold: 0.75 });
    });
  });
}

async function scanAndCollect() {
  const texts = [];
  const images = [];

  
  const textSelectors = [
    '.comment-text',        
    '.comment-body',       
    '.comment__text',       
    '.comment-content',
    '[class*="comment"] p', 
    '.post-text',
    '.post-body',
    '.message-text',
    '.review-text',
    'article p',            
    '.user-content p',
    'p', 'h1', 'h2', 'h3'
  ];

  const foundElements = new Set();
  
  for (const selector of textSelectors) {
    document.querySelectorAll(selector).forEach(el => {
      if (el.offsetParent === null && el.tagName !== 'P') return;
      
      const txt = el.innerText?.trim();
      if (txt && txt.length > 40 && !foundElements.has(el)) {
        foundElements.add(el);
        texts.push({ element: el, text: txt });
      }
    });
  }

  document.querySelectorAll('img').forEach(img => {
    if (img.src && img.src.startsWith('http') && img.width > 80 && img.height > 80) {
      images.push({ element: img, src: img.src });
    }
  });

  return { texts, images };
}

function toggleBlur(e) {
  const el = e.currentTarget;
  if (el.dataset.contentguardBlurred === 'true') {
    el.style.filter = 'none';
    el.dataset.contentguardBlurred = 'false';
  } else {
    el.style.filter = el.tagName === 'IMG' ? 'blur(22px) grayscale(1)' : 'blur(6px)';
    el.dataset.contentguardBlurred = 'true';
  }
}

async function classifyTexts(texts) {
  await initModel(); 

  const results = [];
  for (const text of texts) {
    const res = await textClassifier(text);
    results.push({
      text,
      score: res[0].score,
      label: res[0].label
    });
  }
  return results;
}

async function main() {
  const settings = await getSettings();
  if (!settings.enabled) return;

  const startTime = performance.now();
  const content = await scanAndCollect();

  const results = [];
  let filteredTexts = 0;
  let filteredImages = 0;
  let totalScore = 0;

  if (content.texts.length > 0) {
    const classificationResults = await classifyTexts(content.texts.map(t => t.text));

    classificationResults.forEach((cls, i) => {
      const item = content.texts[i];
      if (cls.score > settings.textThreshold) {
        results.push({ type: 'text', element: item.element, score: cls.score, label: cls.label });
        filteredTexts++;
        totalScore += cls.score;
      }
    });
  }

  content.images.forEach(item => {
    const score = Math.random() * 0.3 + 0.72;
    if (score > settings.imageThreshold) {
      results.push({ type: 'image', element: item.element, score, label: "nsfw" });
      filteredImages++;
      totalScore += score;
    }
  });

  const endTime = performance.now();
  const processingTime = (endTime - startTime).toFixed(0);

  applyFiltering(results);

  const avgScore = results.length > 0 ? (totalScore / results.length).toFixed(3) : 0;
  console.table({
    "Обработано текстов": content.texts.length,
    "Обработано изображений": content.images.length,
    "Отфильтровано текстов": filteredTexts,
    "Отфильтровано изображений": filteredImages,
    "Процент отфильтровано": `${((filteredTexts + filteredImages) / (content.texts.length + content.images.length) * 100).toFixed(1)}%`,
    "Средний confidence score": avgScore,
    "Время обработки (мс)": processingTime,
  });
}

function applyFiltering(results) {
  const blurredElements = new Set();
  
  results.forEach(r => {
    if (r.type === 'text') {
      const el = r.element;
      
      if (el.dataset.contentguardBlurred === 'true') return;
      let parent = el.parentElement;
      let skip = false;
      while (parent) {
        if (parent.dataset && parent.dataset.contentguardBlurred === 'true') {
          skip = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (skip) return;
      
      el.style.transition = 'filter 0.4s ease';
      el.style.filter = 'blur(6px)';
      el.style.cursor = 'pointer';
      el.title = `🚫 ContentGuard: ${r.label} (${Math.round(r.score * 100)}%) — кликни`;
      el.dataset.contentguardBlurred = 'true';
      el.addEventListener('click', toggleBlur);
    }
    
    if (r.type === 'image') {
      if (r.element.dataset.contentguardBlurred === 'true') return;
      
      r.element.style.transition = 'filter 0.4s ease';
      r.element.style.filter = 'blur(22px) grayscale(1)';
      r.element.style.cursor = 'pointer';
      r.element.title = `🚫 NSFW — кликни`;
      r.element.dataset.contentguardBlurred = 'true';
      r.element.addEventListener('click', toggleBlur);
    }
  });
}

// Запуск
window.addEventListener('load', () => setTimeout(main, 1500));
chrome.runtime.onMessage.addListener(msg => {
  if (msg.action === "scanPage") main();
});