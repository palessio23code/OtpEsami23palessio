// ===== Stato =====
let currentPlan = [];
let rawJson = [];
let pickedInclude = new Set();
let pickedExclude = new Set();
let totalSediCount = 0;
// NUOVO: Stato per l'ordinamento della tabella
let sortState = {
    column: 'dt', // Colonna di default (data)
    direction: 'asc' // Direzione di default (ascendente)
};


// ===== Utils =====
function parseDateTimeIT(s) { if (!s) return null; const m = String(s).trim().match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})(?:\s*(?:ore\s*)?(\d{2}):(\d{2}))?$/i); if (!m) return null; const [, dd, mm, yyyy, HH, MM] = m; const d = new Date(`${yyyy}-${mm}-${dd}T${HH || '00'}:${MM || '00'}:00`); return isNaN(d) ? null : d; }
const formatDate = d => d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
const formatTime = d => d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const prettySede = s => s ? String(s).replace(/^\s*Sede\s+/i, '').replace(/\s+/g, ' ').trim() : '';
const normalizeSede = s => prettySede(s).replace(/[(),]/g, ' ').replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().trim();
function examId(e) { const dt = parseDateTimeIT(e.data); return [String(e.corso), dt ? dt.toISOString() : String(e.data), normalizeSede(e.sede || '')].join('|'); }
function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    document.getElementById('toast-message').textContent = msg;
    el.classList.remove('opacity-0', 'translate-y-4');
    setTimeout(() => { el.classList.add('opacity-0', 'translate-y-4'); }, 2500);
}

function normTxt(s) { return String(s || '').replace(/_/g, ' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/[^\p{L}\p{N}\s:\/-]/gu, ' ').replace(/\s+/g, ' ').trim(); }
function smartMatch(haystack, needle) { if (!needle) return true; const H = normTxt(haystack); const N = normTxt(needle); if (!N) return true; if (H.includes(N)) return true; const tokens = N.split(' ').filter(Boolean); return tokens.every(t => H.includes(t)); }

// ===== Tema & UI =====
document.getElementById('theme-toggle').addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.getElementById('theme-icon-light').classList.toggle('hidden', isDark);
    document.getElementById('theme-icon-dark').classList.toggle('hidden', !isDark);
});
if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
    document.getElementById('theme-icon-light').classList.add('hidden');
    document.getElementById('theme-icon-dark').classList.remove('hidden');
} else {
    document.getElementById('theme-icon-light').classList.remove('hidden');
    document.getElementById('theme-icon-dark').classList.add('hidden');
}

document.querySelectorAll('[data-value-target]').forEach(pill => {
    pill.addEventListener('click', () => {
        const targetId = pill.dataset.valueTarget;
        const value = pill.dataset.value;
        const targetInput = document.getElementById(targetId);
        if (targetInput) {
            targetInput.value = value;
        }
    });
});

document.getElementById('quick-date-select-start').addEventListener('change', e => {
    const value = e.target.value;
    const targetInput = document.getElementById('min-date');
    if (!targetInput || !value) return;
    if (value === 'today') {
        const today = new Date();
        today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
        targetInput.value = today.toISOString().split('T')[0];
    } else {
        targetInput.value = value;
    }
});

document.getElementById('quick-date-select-end').addEventListener('change', e => {
    const value = e.target.value;
    const targetInput = document.getElementById('max-date');
    if (!targetInput || !value) return;
    targetInput.value = value;
});


document.querySelectorAll('[data-action="increment"],[data-action="decrement"]').forEach(btn => {
    btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target); if (!input) return;
        let v = Number(input.value) || 0; const step = Number(input.step) || 1;
        input.value = btn.dataset.action === 'increment' ? v + step : Math.max(Number(input.min) || -Infinity, v - step);
    });
});
document.getElementById('free-sede-select').addEventListener('change', e => {
    const other = document.getElementById('free-sede-other');
    if (e.target.value === 'Altro') other.classList.remove('hidden'); else { other.classList.add('hidden'); other.value = ''; }
});

// ===== Dropzone =====
const dropzone = document.getElementById('file-dropzone'), fileInput = document.getElementById('file-input'), fileNameDisplay = document.getElementById('file-name');
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('border-primary', 'bg-primary/10'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('border-primary', 'bg-primary/10'));
dropzone.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('border-primary', 'bg-primary/10'); if (e.dataTransfer.files.length) { fileInput.files = e.dataTransfer.files; updateFileName(fileInput.files[0]); loadFile(); } });
fileInput.addEventListener('change', () => { if (fileInput.files.length) { updateFileName(fileInput.files[0]); loadFile(); } });
function updateFileName(file) { fileNameDisplay.textContent = file ? file.name : ''; }
function loadFile() {
    const f = fileInput.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = e => {
        try {
            rawJson = JSON.parse(e.target.result);
            const uniqueSedi = new Set(rawJson.map(e => prettySede(e.sede || '')));
            totalSediCount = uniqueSedi.size;
            document.getElementById('toggle-selection-btn').disabled = false;
            buildExamList();
            updateManualSelectionSummary();
            showToast('File caricato con successo');
        }
        catch (err) { showToast('Errore: file JSON non valido.', 'error'); console.error(err); }
    }; r.readAsText(f);
}

// ===== Sezione a Comparsa (Accordion) =====
const toggleBtn = document.getElementById('toggle-selection-btn');
const selectionSection = document.getElementById('manual-selection-section');
const toggleIcon = document.getElementById('toggle-selection-icon');

toggleBtn.addEventListener('click', () => {
    if (toggleBtn.disabled) return;
    const isHidden = selectionSection.classList.toggle('hidden');
    toggleIcon.classList.toggle('rotate-180', !isHidden);
    if (!isHidden) {
        selectionSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
});

// ===== Ricerca / Tabella =====
const searchInput = document.getElementById('search-input');
const showOnlyPicked = document.getElementById('show-only-picked');

document.getElementById('refresh-list').addEventListener('click', () => { buildExamList(); updateManualSelectionSummary(); showToast('Elenco aggiornato'); });
['input', 'change'].forEach(ev => searchInput.addEventListener(ev, () => { buildExamList(); updateManualSelectionSummary(); }));
showOnlyPicked.addEventListener('change', () => { buildExamList(); updateManualSelectionSummary(); });
document.getElementById('min-date').addEventListener('change', () => { buildExamList(); updateManualSelectionSummary(); });
document.getElementById('max-date').addEventListener('change', () => { buildExamList(); updateManualSelectionSummary(); });

function filteredRaw() {
    const min = document.getElementById('min-date').value ? new Date(document.getElementById('min-date').value + 'T00:00:00') : null;
    const max = document.getElementById('max-date').value ? new Date(document.getElementById('max-date').value + 'T23:59:59') : null;
    return (rawJson || []).filter(e => {
        const tipo = String(e.tipo || '').toUpperCase().trim();
        const mod = String(e.modalita || '').toLowerCase().trim();
        if (!(tipo === 'ONLINE' || mod.includes('online') || mod.includes('remoto'))) return false;
        const dt = parseDateTimeIT(e.data); if (!dt) return false;
        if (min && dt < min) return false;
        if (max && dt > max) return false;
        return true;
    });
}
function currentRows() {
    const term = searchInput.value;
    const onlyPicked = showOnlyPicked.checked;
    const rows = filteredRaw()
        .map(e => { const dt = parseDateTimeIT(e.data); const corso = String(e.corso); const sede = prettySede(e.sede || ''); const searchBlob = `${corso} ${sede} ${formatDate(dt)} ${formatTime(dt)}`; return { id: examId(e), corso, sede, dt, searchBlob }; })
        .filter(r => smartMatch(r.searchBlob, term))
        .filter(r => !onlyPicked || pickedInclude.has(r.id) || pickedExclude.has(r.id));

    // NUOVO: Logica di ordinamento dinamica
    rows.sort((a, b) => {
        const col = sortState.column;
        let comparison = 0;
        if (col === 'dt') {
            comparison = a.dt - b.dt;
        } else {
            comparison = a[col].localeCompare(b[col]);
        }
        return comparison * (sortState.direction === 'asc' ? 1 : -1);
    });
    
    return rows;
}

function buildExamList() {
    const body = document.getElementById('exam-list'); body.innerHTML = '';
    currentRows().forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td data-label="Includi"><input type="checkbox" data-id="${r.id}" data-action="include" ${pickedInclude.has(r.id) ? 'checked' : ''}></td>
          <td data-label="Escludi"><input type="checkbox" data-id="${r.id}" data-action="exclude" ${pickedExclude.has(r.id) ? 'checked' : ''}></td>
          <td data-label="Data">${formatDate(r.dt)}</td>
          <td data-label="Ora">${formatTime(r.dt)}</td>
          <td data-label="Corso">${r.corso.replace(/_/g, ' ')}</td>
          <td data-label="Sede">${r.sede}</td>
        `;
        body.appendChild(tr);
    });
    // NUOVO: Aggiorna gli indicatori visivi dopo aver costruito la lista
    updateSortIndicators();
}

// NUOVA FUNZIONE: Aggiorna gli indicatori di ordinamento (frecce)
function updateSortIndicators() {
    document.querySelectorAll('.sortable-header').forEach(header => {
        const indicator = header.querySelector('.sort-indicator');
        if (header.dataset.sort === sortState.column) {
            indicator.textContent = sortState.direction === 'asc' ? ' ▲' : ' ▼';
        } else {
            indicator.textContent = '';
        }
    });
}

// NUOVO: Event listener per i click sulle intestazioni
document.querySelectorAll('.sortable-header').forEach(header => {
    header.addEventListener('click', () => {
        const clickedColumn = header.dataset.sort;
        if (sortState.column === clickedColumn) {
            sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            sortState.column = clickedColumn;
            sortState.direction = 'asc';
        }
        buildExamList(); // Ricostruisce la tabella con il nuovo ordinamento
    });
});


document.getElementById('exam-list').addEventListener('change', e => {
    if (e.target.type === 'checkbox') {
        const id = e.target.dataset.id;
        const action = e.target.dataset.action;
        const isChecked = e.target.checked;
        if (action === 'include') {
            if (isChecked) {
                pickedInclude.add(id);
                pickedExclude.delete(id);
                const excludeCheckbox = document.querySelector(`input[data-id="${id}"][data-action="exclude"]`);
                if (excludeCheckbox) excludeCheckbox.checked = false;
            } else {
                pickedInclude.delete(id);
            }
        } else if (action === 'exclude') {
            if (isChecked) {
                pickedExclude.add(id);
                pickedInclude.delete(id);
                const includeCheckbox = document.querySelector(`input[data-id="${id}"][data-action="include"]`);
                if (includeCheckbox) includeCheckbox.checked = false;
            } else {
                pickedExclude.delete(id);
            }
        }
        updateManualSelectionSummary();
    }
});

function updateManualSelectionSummary() {
    const summaryText = document.getElementById('manual-selection-summary');
    const summaryBadge = document.getElementById('manual-selection-badge');
    if (!rawJson || rawJson.length === 0) {
        summaryText.textContent = 'Carica un file JSON per abilitare';
        summaryBadge.classList.add('hidden');
        return;
    }
    summaryText.textContent = `Gestisci inclusioni/esclusioni (${totalSediCount} sedi caricate)`;
    summaryBadge.textContent = `${pickedInclude.size} includi · ${pickedExclude.size} escludi`;
    summaryBadge.classList.remove('hidden');
}

document.getElementById('select-all-include').addEventListener('click', () => { currentRows().forEach(r => { pickedInclude.add(r.id); pickedExclude.delete(r.id); }); buildExamList(); updateManualSelectionSummary(); });
document.getElementById('select-all-exclude').addEventListener('click', () => { currentRows().forEach(r => { pickedExclude.add(r.id); pickedInclude.delete(r.id); }); buildExamList(); updateManualSelectionSummary(); });
document.getElementById('unselect-all').addEventListener('click', () => { currentRows().forEach(r => { pickedExclude.delete(r.id); pickedInclude.delete(r.id); }); buildExamList(); updateManualSelectionSummary(); });

function checkUnavailableCourses(allExams, minDateStr, maxDateStr) {
    if (!allExams || allExams.length === 0) return [];
    const allCourses = [...new Set(allExams.map(e => String(e.corso)))];
    if (allCourses.length === 0) return [];
    const minDate = minDateStr ? new Date(minDateStr + 'T00:00:00') : null;
    const maxDate = maxDateStr ? new Date(maxDateStr + 'T23:59:59') : null;
    if (!minDate && !maxDate) return [];
    const availableCourses = new Set();
    for (const exam of allExams) {
        const examDate = parseDateTimeIT(exam.data);
        if (!examDate) continue;
        const isAfterMin = !minDate || examDate >= minDate;
        const isBeforeMax = !maxDate || examDate <= maxDate;
        if (isAfterMin && isBeforeMax) {
            availableCourses.add(String(exam.corso));
        }
    }
    return allCourses.filter(course => !availableCourses.has(course));
}

function optimize(allExams, params) {
    let df = allExams.map(e => ({ ...e, data_dt: parseDateTimeIT(e.data) }))
        .filter(e => e.data_dt instanceof Date && !isNaN(e.data_dt))
        .map(e => ({ ...e, sede_pretty: prettySede(e.sede), sede_clean: normalizeSede(e.sede), course: String(e.corso), id: examId(e) }));

    df = df.filter(e => {
        const tipo = String(e.tipo || '').toUpperCase().trim();
        const mod = String(e.modalita || '').toLowerCase().trim();
        if (!(tipo === 'ONLINE' || mod.includes('online') || mod.includes('remoto'))) return false;
        if (params.min_date && e.data_dt < new Date(params.min_date + 'T00:00:00')) return false;
        if (params.max_date && e.data_dt > new Date(params.max_date + 'T23:59:59')) return false;
        return true;
    });

    if (params.excluded_ids?.length) {
        const ex = new Set(params.excluded_ids);
        df = df.filter(e => !ex.has(e.id));
    }
    df.forEach(e => e.day = new Date(e.data_dt.getFullYear(), e.data_dt.getMonth(), e.data_dt.getDate()));

    const totalUniqueCourses = new Set(df.map(e => e.course)).size;
    if (!df.length) return { chosen: [], stats: { total_unique_courses: 0, planned_unique: 0, unplanned_courses: [], used_sedi: [], max_sedi: params.max_sedi, reached_max_sedi: false, locked_not_scheduled: [] } };

    let chosen = [], chosen_courses = new Set(), usedSedi = new Set(), perDay = {}, locked_not_scheduled = [];
    
    // --- STEP 1: Processa esami bloccati ---
    if (params.locked_ids?.length) {
        const locked = df.filter(e => params.locked_ids.includes(e.id)).sort((a, b) => a.data_dt - b.data_dt);
        for (const e of locked) {
            if (chosen.length >= params.max_exams) break;
            const dayKey = e.day.getTime();
            if ((perDay[dayKey] || 0) >= params.max_per_day) { locked_not_scheduled.push(e); continue; }
            const tooClose = chosen.some(c => Math.abs((e.day - c.day) / 86400000) < params.min_gap_days && (e.day - c.day) !== 0);
            if (tooClose) { locked_not_scheduled.push(e); continue; }
            if (usedSedi.size >= params.max_sedi && !usedSedi.has(e.sede_clean)) { locked_not_scheduled.push(e); continue; }
            
            chosen.push(e);
            chosen_courses.add(e.course);
            usedSedi.add(e.sede_clean);
            perDay[dayKey] = (perDay[dayKey] || 0) + 1;
        }
    }

    const fillPlan = (candidates) => {
        for (const e of candidates) {
            if (chosen.length >= params.max_exams) break;
            if (chosen_courses.has(e.course)) continue;
            const dayKey = e.day.getTime();
            if ((perDay[dayKey] || 0) >= params.max_per_day) continue;
            const tooClose = chosen.some(c => Math.abs((e.day - c.day) / 86400000) < params.min_gap_days && (e.day - c.day) !== 0);
            if (tooClose) continue;
            if (!usedSedi.has(e.sede_clean) && usedSedi.size >= params.max_sedi) continue;
            chosen.push(e);
            chosen_courses.add(e.course);
            usedSedi.add(e.sede_clean);
            perDay[dayKey] = (perDay[dayKey] || 0) + 1;
        }
    };

    // --- STEP 2: Saturazione con la sede gratuita (priorità assoluta) ---
    if (params.free_sede_exact && chosen.length < params.max_exams) {
        const freeSedeClean = normalizeSede(params.free_sede_exact);
        const freeSedeCandidates = df.filter(e => e.sede_clean.includes(freeSedeClean) && !chosen_courses.has(e.course)).sort((a, b) => a.data_dt - b.data_dt);
        fillPlan(freeSedeCandidates);
    }

    // --- STEP 3: Saturazione delle sedi già in uso dagli esami bloccati ---
    const lockedSedi = new Set( (params.locked_ids||[]).map(id => df.find(e => e.id === id)?.sede_clean).filter(Boolean) );
    if (lockedSedi.size > 0 && chosen.length < params.max_exams) {
        const lockedSediCandidates = df.filter(e => lockedSedi.has(e.sede_clean) && !chosen_courses.has(e.course)).sort((a,b) => a.data_dt - b.data_dt);
        fillPlan(lockedSediCandidates);
    }
    
    // --- STEP 4: Riempimento finale con altre sedi ---
    let reachedMaxSedi = false;
    while (chosen.length < params.max_exams) {
        if (usedSedi.size >= params.max_sedi) { reachedMaxSedi = true; break; }
        
        const candidateSedi = [...new Set(df.filter(e => !chosen_courses.has(e.course)).map(e => e.sede_clean))].filter(s => !usedSedi.has(s));
        if (!candidateSedi.length) break;

        let bestNextSede = { sede: null, additions: [], score: -1 };
        for (const sede of candidateSedi) {
            let tempAdditions = [];
            let tempCourses = new Set(chosen_courses);
            let tempPerDay = { ...perDay };
            const examsFromSede = df.filter(e => e.sede_clean === sede && !tempCourses.has(e.course)).sort((a, b) => a.data_dt - b.data_dt);
            for (const exam of examsFromSede) {
                if (chosen.length + tempAdditions.length >= params.max_exams) break;
                if (tempCourses.has(exam.course)) continue;
                const dayKey = exam.day.getTime();
                if ((tempPerDay[dayKey] || 0) >= params.max_per_day) continue;
                const tooClose = [...chosen, ...tempAdditions].some(c => Math.abs((exam.day - c.day) / 86400000) < params.min_gap_days && (exam.day - c.day) !== 0);
                if (tooClose) continue;
                tempAdditions.push(exam);
                tempCourses.add(exam.course);
                tempPerDay[dayKey] = (tempPerDay[dayKey] || 0) + 1;
            }
            if (tempAdditions.length > bestNextSede.score) {
                bestNextSede = { sede, additions: tempAdditions, score: tempAdditions.length };
            }
        }
        
        if (!bestNextSede.sede || bestNextSede.additions.length === 0) break;
        fillPlan(bestNextSede.additions);
    }

    const finalPlan = chosen.map(e => ({ Corso: e.course, Data: formatDate(e.data_dt), Ora: formatTime(e.data_dt), Sede: e.sede_pretty, sede_clean: e.sede_clean, dt: e.data_dt, day: e.day, Chiusura: e.chiusura_prenotazioni || "" }));
    const plannedUnique = new Set(finalPlan.map(c => c.Corso)).size;
    const unplannedCourses = [...new Set(df.map(e => e.course))].filter(c => !new Set(finalPlan.map(x => x.Corso)).has(c));
    
    return {
        chosen: finalPlan.sort((a,b) => a.dt - b.dt).map(c => ({ ...c, dt: c.dt.toISOString() })),
        stats: { total_unique_courses: totalUniqueCourses, planned_unique: plannedUnique, unplanned_courses: unplannedCourses, used_sedi: [...usedSedi], max_sedi: params.max_sedi, reached_max_sedi: reachedMaxSedi, locked_not_scheduled: (locked_not_scheduled || []).map(e => ({ corso: e.course, when: formatDate(e.data_dt) + ' ' + formatTime(e.data_dt), sede: e.sede_pretty })) }
    };
}


// ===== Calendar =====
function computeManuallyExcludedCoursesForPeriod() { const idsInPeriod = new Set(filteredRaw().map(e => examId(e))); const excludedIds = [...pickedExclude].filter(id => idsInPeriod.has(id)); const idToCourse = new Map(filteredRaw().map(e => [examId(e), String(e.corso)])); const uniqueCourses = [...new Set(excludedIds.map(id => idToCourse.get(id)))].filter(Boolean); return uniqueCourses; }
function addToGoogleCalendar(exam) { const start = new Date(exam.dt).toISOString().replace(/-|:|\.\d\d\d/g, ''); const end = new Date(new Date(exam.dt).getTime() + 60 * 60 * 1000).toISOString().replace(/-|:|\.\d\d\d/g, ''); const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Esame: ' + exam.Corso)}&dates=${start}/${end}&details=${encodeURIComponent('Esame di ' + exam.Corso)}&location=${encodeURIComponent(exam.Sede)}`; window.open(url, '_blank'); }

// ===== Output =====
function displayResults(payload) {
    const out = document.getElementById('results'), container = document.getElementById('results-container');
    const res = !payload.chosen ? { chosen: payload, stats: {} } : (Array.isArray(payload) ? { chosen: payload, stats: { total_unique_courses: payload.length, planned_unique: payload.length, unplanned_courses: [], used_sedi: [...new Set(payload.map(x => x.sede_clean))], max_sedi: Infinity, reached_max_sedi: false, locked_not_scheduled: [] } } : payload);
    currentPlan = res.chosen.map(c => ({ ...c, dt: new Date(c.dt) })); const stats = res.stats || {};

    container.classList.remove('hidden');
    container.classList.add('fade-in-up');
    out.innerHTML = '';

    let headerHTML = '';

    const unavailableCourses = res.unavailable_courses || [];
    if (unavailableCourses.length > 0) {
        headerHTML += `<div class="rounded-lg border border-orange-400 bg-orange-50 dark:bg-orange-900/20 p-3 text-orange-700 dark:text-orange-300 mb-3"><b>Nessun appello nel periodo:</b> ${unavailableCourses.map(s => s.replace(/_/g, ' ')).join(' &middot; ')}</div>`;
    }

    if (!currentPlan.length) {
        out.innerHTML = headerHTML + `<div class="rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-4 text-amber-800 dark:text-amber-300">Nessun piano trovato con i vincoli correnti.</div>`;
        document.getElementById('save-plan-btn').classList.add('hidden');
        return;
    }
    document.getElementById('save-plan-btn').classList.remove('hidden');

    const manuallyExcludedCourses = computeManuallyExcludedCoursesForPeriod();
    if (manuallyExcludedCourses.length) { headerHTML += `<div class="rounded-lg border border-blue-400 bg-blue-50 dark:bg-blue-900/20 p-3 text-blue-700 dark:text-blue-200 mb-3"><b>Esclusi manualmente</b>: ${manuallyExcludedCourses.map(s => s.replace(/_/g, ' ')).join(' · ')}</div>`; }
    if (stats.unplanned_courses?.length) { headerHTML += `<div class="rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 text-amber-800 dark:text-amber-300 mb-3"><b>Non pianificati</b>: ${stats.unplanned_courses.map(s => s.replace(/_/g, ' ')).join(' · ')}</div>`; }
    if (stats.locked_not_scheduled?.length) { headerHTML += `<div class="rounded-lg border border-red-400 bg-red-50 dark:bg-red-900/20 p-3 text-red-700 dark:text-red-300 mb-3"><b>"Includi" non inseriti per conflitti</b>: <ul class="list-disc ml-5 text-sm mt-1">${stats.locked_not_scheduled.map(x => `<li>${x.corso.replace(/_/g, ' ')} — ${x.when}</li>`).join('')}</ul></div>`; }

    const uniqueSedi = [...new Set(currentPlan.map(r => r.Sede))]; const groups = {};
    currentPlan.forEach(r => { (groups[r.Data] || (groups[r.Data] = [])).push(r); });

    let resultsHTML = `${headerHTML}<div class='mb-4 text-sm p-3 bg-slate-500/10 rounded-lg'>Sedi utilizzate: <b>${uniqueSedi.length}</b> — ${uniqueSedi.join(' · ')}</div>`;
    let resultCounter = 0;

    Object.keys(groups).sort((a, b) => new Date(a.split('/').reverse().join('-')) - new Date(b.split('/').reverse().join('-'))).forEach(dateKey => {
        groups[dateKey].sort((a, b) => a.dt - b.dt).forEach(e => {
            const examJson = JSON.stringify(e).replace(/"/g, '&quot;'), d = e.dt, day = d.getDate(), month = d.toLocaleDateString('it-IT', { month: 'short' }).replace('.', '');
            resultsHTML += `<div class="stagger-item flex items-stretch gap-4 p-4 mb-3 border border-border-color rounded-xl transition-all duration-300 hover:shadow-lg hover:border-primary/50 hover:bg-primary/5 hover:scale-[1.02]" style="animation-delay: ${resultCounter * 70}ms"><div class="calendar-icon"><div class="month">${month}</div><div class="day">${day}</div></div><div class="flex-grow"><p class="font-bold text-foreground-primary">${e.Corso.replace(/_/g, ' ')}</p><p class="text-sm">${e.Sede}</p><p class="text-xs mt-1"><span class="font-semibold">Orario:</span> ${e.Ora}</p></div><div class="flex items-center"><button onclick='addToGoogleCalendar(${examJson})' class='btn btn-secondary !py-1.5 !px-3 !text-xs !rounded-md'>Calendario</button></div></div>`;
            resultCounter++;
        });
    });
    out.innerHTML = resultsHTML;
}

// ===== Persistenza piani =====
document.getElementById('save-plan-btn')?.addEventListener('click', () => {
    if (!currentPlan.length) return;
    const saved = JSON.parse(localStorage.getItem('examPlans') || '[]');
    saved.unshift({ date: new Date().toISOString(), plan: currentPlan.map(c => ({ ...c, dt: c.dt.toISOString() })) });
    localStorage.setItem('examPlans', JSON.stringify(saved));
    displaySavedPlans(); showToast('Piano salvato!');
});
function loadSavedPlan(i) { const saved = JSON.parse(localStorage.getItem('examPlans') || '[]'); if (i >= saved.length) return; displayResults({ chosen: saved[i].plan, stats: {} }); document.getElementById('results-container').scrollIntoView({ behavior: 'smooth' }); }
function displaySavedPlans() {
    const saved = JSON.parse(localStorage.getItem('examPlans') || '[]');
    const cont = document.getElementById('saved-plans-container'), out = document.getElementById('saved-plans');
    if (!saved.length) { cont.classList.add('hidden'); return; }

    cont.classList.remove('hidden');
    if (!cont.classList.contains('fade-in-up')) {
        cont.classList.add('fade-in-up');
    }

    out.innerHTML = '';
    saved.forEach((s, idx) => {
        const when = new Date(s.date).toLocaleString('it-IT'); const sedi = [...new Set(s.plan.map(p => p.Sede))].join(', ');
        out.innerHTML += `<div class="p-4 border border-border-color rounded-lg flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 transition-all duration-300 cursor-pointer hover:shadow-md hover:border-primary/30 dark:hover:border-primary/30 hover:bg-primary/5 dark:hover:bg-primary/10" onclick="loadSavedPlan(${idx})"><div class="flex-1 text-left w-full"><div class="font-semibold text-foreground-primary text-sm">Salvataggio del ${when}</div><p class="text-xs text-foreground-muted mt-1">${s.plan.length} esami · Sedi: ${sedi}</p></div><button class="btn btn-secondary !py-2 !px-4 !rounded-md w-full sm:w-auto mt-3 sm:mt-0" onclick="event.stopPropagation(); loadSavedPlan(${idx})">Visualizza</button></div>`;
    });
}
document.getElementById('clear-plans-btn')?.addEventListener('click', () => { if (window.confirm('Eliminare tutti i piani salvati?')) { localStorage.removeItem('examPlans'); displaySavedPlans(); } });
displaySavedPlans();

// ===== Run =====
document.getElementById('run-btn').addEventListener('click', () => {
    if (!rawJson.length) { showToast('Seleziona prima un file JSON!', 'error'); return; }
    let sedeVal = document.getElementById('free-sede-select').value; if (sedeVal === 'Altro') sedeVal = document.getElementById('free-sede-other').value.trim();
    const params = { max_exams: +document.getElementById('max-exams').value, max_per_day: +document.getElementById('max-per-day').value, min_gap_days: +document.getElementById('min-gap-days').value, min_date: document.getElementById('min-date').value, max_date: document.getElementById('max-date').value, free_sede_exact: sedeVal, max_sedi: +document.getElementById('max-sedi').value || Infinity, locked_ids: [...pickedInclude], excluded_ids: [...pickedExclude] };

    const unavailable = checkUnavailableCourses(rawJson, params.min_date, params.max_date);

    const res = optimize(rawJson, params);
    res.unavailable_courses = unavailable;

    displayResults(res);
    document.getElementById('results-container').scrollIntoView({ behavior: 'smooth' });
});

// ===== Custom Select =====
function setupCustomSelects() {
    document.querySelectorAll('select').forEach(selectElement => {
        if (selectElement.parentNode.classList.contains('custom-select-container')) {
            return;
        }
        const container = document.createElement('div');
        container.className = 'custom-select-container';
        selectElement.parentNode.replaceChild(container, selectElement);
        container.appendChild(selectElement);

        const trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';

        const selectedDisplay = document.createElement('span');
        selectedDisplay.textContent = selectElement.options[selectElement.selectedIndex].textContent;

        const arrow = document.createElement('div');
        arrow.innerHTML = `<svg class="w-5 h-5 text-foreground-muted transition-transform" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>`;

        if (selectElement.classList.contains('date-pill')) {
            trigger.className += ' date-pill !py-1 !px-2';
        } else {
            trigger.className += ' w-full input-base px-3 py-2.5';
            trigger.style.height = '2.75rem';
        }

        trigger.appendChild(selectedDisplay);
        trigger.appendChild(arrow);
        container.appendChild(trigger);

        const options = document.createElement('div');
        options.className = 'custom-select-options card';
        if (selectElement.classList.contains('date-pill')) {
            options.style.minWidth = '160px';
        }

        Array.from(selectElement.options).forEach(option => {
            if (option.value === "" && selectElement.id.startsWith('quick-date')) return;

            const optionEl = document.createElement('div');
            optionEl.className = 'custom-select-option';
            optionEl.textContent = option.textContent;
            optionEl.dataset.value = option.value;

            if (option.selected) {
                optionEl.classList.add('selected');
            }

            optionEl.addEventListener('click', (e) => {
                e.stopPropagation();
                selectElement.value = option.value;
                selectElement.dispatchEvent(new Event('change', { bubbles: true }));

                if (selectElement.id.startsWith('quick-date-select')) {
                    selectedDisplay.textContent = selectElement.options[0].textContent;
                } else {
                    selectedDisplay.textContent = option.textContent;
                    options.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
                    optionEl.classList.add('selected');
                }
                closeAllSelects();
            });
            options.appendChild(optionEl);
        });
        container.appendChild(options);

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = options.classList.contains('open');
            closeAllSelects();
            if (!isOpen) {
                options.classList.add('open');
                arrow.firstElementChild.style.transform = 'rotate(180deg)';
            }
        });
    });
}

function closeAllSelects() {
    document.querySelectorAll('.custom-select-options.open').forEach(options => {
        options.classList.remove('open');
        const arrow = options.previousElementSibling.querySelector('svg');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    });
}

document.addEventListener('click', closeAllSelects);
window.addEventListener('load', setupCustomSelects);

// init
buildExamList(); updateManualSelectionSummary();