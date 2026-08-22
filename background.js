import { pipeline, env } from '@xenova/transformers';

let textClassifier = null;

async function initModel() {
  if (textClassifier) return textClassifier;

  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.useBrowserCache = true;

  env.localModelPath = chrome.runtime.getURL('models/');

  const modelName = 'toxic-bert-russian-onnx';
  const modelPath = env.localModelPath + modelName; 

  console.log('📥 [background] Загрузка ЛОКАЛЬНОЙ модели...', modelPath);

  textClassifier = await pipeline('text-classification', modelName, {
    quantized: false,
    local_files_only: true,
  });

  console.log('%c✅ [background] ONNX-модель успешно загружена!', 'color:#7ee0c3; font-size:16px');
  return textClassifier;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'classifyTexts' && message.texts?.length) {
    (async () => {
      try {
        await initModel();
        const results = [];

        for (const text of message.texts) {
          const res = await textClassifier(text);
          results.push({
            text,
            score: res[0].score,
            label: res[0].label
          });
        }

        sendResponse({ results });
      } catch (err) {
        console.error('[background] Ошибка классификации:', err);
        sendResponse({ error: err.message });
      }
    })();
    return true; 
  }
});