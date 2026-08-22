const enabled = document.getElementById('enabled');
const textSlider = document.getElementById('textThreshold');
const textVal = document.getElementById('textVal');
const saveBtn = document.getElementById('save');

async function loadSettings() {
  const data = await chrome.storage.sync.get('settings');
  const s = data.settings || { enabled: true, textThreshold: 0.75, imageThreshold: 0.80 };
  enabled.checked = s.enabled;
  textSlider.value = s.textThreshold * 100;
  textVal.textContent = textSlider.value;
}

textSlider.oninput = () => textVal.textContent = textSlider.value;

saveBtn.onclick = async () => {
  const settings = {
    enabled: enabled.checked,
    textThreshold: textSlider.value / 100,
    hideText: true,
  };
  await chrome.storage.sync.set({ settings });
  alert('Настройки сохранены!\nПерезагрузите страницу для применения.');
};

loadSettings();