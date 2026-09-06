// Lightweight custom dropdown, used anywhere we need a native <select>
// replaced with something we can style consistently (DOB picker, settings, etc).
//
// Usage:
//   createDropdown(containerEl, {
//     options: [{ value: '1', label: 'January' }, ...],
//     value: '1',
//     placeholder: 'Month',
//     onChange: (value) => {}
//   })
// Returns { setValue(value), getValue(), destroy() }

function createDropdown(container, { options, value, placeholder = 'Select', onChange }) {
  container.classList.add('custom-dropdown');
  container.innerHTML = '';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-dropdown-trigger';

  const label = document.createElement('span');
  label.className = 'custom-dropdown-label';

  const arrow = document.createElement('span');
  arrow.className = 'custom-dropdown-arrow';
  arrow.innerHTML = '&#9662;';

  trigger.appendChild(label);
  trigger.appendChild(arrow);

  const menu = document.createElement('div');
  menu.className = 'custom-dropdown-menu';

  let currentValue = value;
  let isOpen = false;

  function renderLabel() {
    const match = options.find(o => String(o.value) === String(currentValue));
    label.textContent = match ? match.label : placeholder;
    label.classList.toggle('is-placeholder', !match);
  }

  function renderMenu() {
    menu.innerHTML = '';
    options.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'custom-dropdown-item';
      item.textContent = opt.label;
      if (String(opt.value) === String(currentValue)) item.classList.add('selected');
      item.addEventListener('click', () => {
        currentValue = opt.value;
        renderLabel();
        renderMenu();
        close();
        if (onChange) onChange(currentValue);
      });
      menu.appendChild(item);
    });
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    container.classList.add('open');
    document.addEventListener('click', outsideClick, true);
  }

  function close() {
    isOpen = false;
    container.classList.remove('open');
    document.removeEventListener('click', outsideClick, true);
  }

  function outsideClick(e) {
    if (!container.contains(e.target)) close();
  }

  trigger.addEventListener('click', () => {
    isOpen ? close() : open();
  });

  renderLabel();
  renderMenu();

  container.appendChild(trigger);
  container.appendChild(menu);

  return {
    setValue(v) {
      currentValue = v;
      renderLabel();
      renderMenu();
    },
    getValue() {
      return currentValue;
    },
    destroy() {
      close();
      container.innerHTML = '';
    }
  };
}

// --- Date of birth picker built from three custom dropdowns ---
function createDobPicker(container, { onChange } = {}) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  container.classList.add('dob-picker');
  container.innerHTML = `
    <div class="dob-field" data-field="day"></div>
    <div class="dob-field" data-field="month"></div>
    <div class="dob-field" data-field="year"></div>
  `;

  const dayEl = container.querySelector('[data-field="day"]');
  const monthEl = container.querySelector('[data-field="month"]');
  const yearEl = container.querySelector('[data-field="year"]');

  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear - 13; y >= currentYear - 100; y--) years.push({ value: y, label: String(y) });

  const state = { day: null, month: null, year: null };

  function daysInMonth(month, year) {
    if (!month) return 31;
    return new Date(year || currentYear, month, 0).getDate();
  }

  function rebuildDays() {
    const count = daysInMonth(state.month, state.year);
    if (state.day && state.day > count) state.day = null;
    const dayOptions = Array.from({ length: count }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
    dayDropdown.destroy();
    dayDropdown = createDropdown(dayEl, {
      options: dayOptions,
      value: state.day,
      placeholder: 'Day',
      onChange: (v) => { state.day = Number(v); emit(); }
    });
  }

  function emit() {
    if (onChange) onChange({ ...state });
  }

  let dayDropdown = createDropdown(dayEl, {
    options: Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
    value: null,
    placeholder: 'Day',
    onChange: (v) => { state.day = Number(v); emit(); }
  });

  const monthDropdown = createDropdown(monthEl, {
    options: months.map((m, i) => ({ value: i + 1, label: m })),
    value: null,
    placeholder: 'Month',
    onChange: (v) => { state.month = Number(v); rebuildDays(); emit(); }
  });

  const yearDropdown = createDropdown(yearEl, {
    options: years,
    value: null,
    placeholder: 'Year',
    onChange: (v) => { state.year = Number(v); rebuildDays(); emit(); }
  });

  return {
    getValue() {
      if (!state.day || !state.month || !state.year) return null;
      const mm = String(state.month).padStart(2, '0');
      const dd = String(state.day).padStart(2, '0');
      return `${state.year}-${mm}-${dd}`;
    },
    isComplete() {
      return !!(state.day && state.month && state.year);
    }
  };
}
