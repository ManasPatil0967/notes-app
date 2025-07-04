let db;
const dbName = 'NotesDB';
const dbVersion = 1;
let currentEditingId = null;
let currentNoteType = 'normal';

// --- Flashcard Review Modal Logic ---
let reviewFlashcards = [];
let currentReviewIndex = 0;
let isReviewFlipped = false;

// Utility: Convert markdown image syntax to <img> tags
function renderImages(text) {
    if (!text) return '';
    // Convert markdown images ![alt](url)
    text = text.replace(/!\[([^\]]*)\]\(([^\)]+)\)/g, '<img src="$2" alt="$1" class="inline-block max-h-32 my-2 rounded shadow" />');
    return text;
}

function initDB() {
    const request = indexedDB.open(dbName, dbVersion);

    request.onerror = function(event) {
        console.error('Database error:', event.target.error);
    };

    request.onsuccess = function(event) {
        db = event.target.result;
        loadNotes();
    };

    request.onupgradeneeded = function(event) {
        db = event.target.result;
        const objectStore = db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
        objectStore.createIndex('type', 'type', { unique: false });
        objectStore.createIndex('title', 'title', { unique: false });
        objectStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
        objectStore.createIndex('createdAt', 'createdAt', { unique: false });
    };
}


function saveNote(note) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['notes'], 'readwrite');
        const objectStore = transaction.objectStore('notes');
        const request = objectStore.put(note);

        request.onsuccess = function() {
            resolve(request.result);
        };

        request.onerror = function() {
            reject(request.error);
        };
    });
}


function getAllNotes() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['notes'], 'readonly');
        const objectStore = transaction.objectStore('notes');
        const request = objectStore.getAll();

        request.onsuccess = function() {
            resolve(request.result);
        };

        request.onerror = function() {
            reject(request.error);
        };
    });
}


function deleteNote(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['notes'], 'readwrite');
        const objectStore = transaction.objectStore('notes');
        const request = objectStore.delete(id);

        request.onsuccess = function() {
            resolve();
        };

        request.onerror = function() {
            reject(request.error);
        };
    });
}


function showViewModal(note) {
    document.getElementById('viewModalTitle').textContent = note.title;

    let contentHtml = '';

    
    if (note.tags && note.tags.length > 0) {
        contentHtml += `
            <div class="mb-4">
                <h3 class="font-semibold text-gray-700 mb-2">Tags:</h3>
                <div class="flex gap-2 flex-wrap">
                    ${note.tags.map(tag => `<span class="text-sm px-3 py-1 bg-gray-100 text-gray-700 rounded-full">${tag}</span>`).join('')}
                </div>
            </div>
        `;
    }

    
    if (note.type === 'normal') {
        contentHtml += `
            <div class="bg-blue-50 p-4 rounded-lg">
                <h3 class="font-semibold text-blue-800 mb-2">Content:</h3>
                <div class="text-gray-700 whitespace-pre-wrap">${note.content.text}</div>
            </div>
        `;
    } else if (note.type === 'cornell') {
        if (Array.isArray(note.content.qa)) {
            note.content.qa.forEach((pair, idx) => {
                contentHtml += `
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
                        <div class="bg-purple-50 p-4 rounded-lg">
                            <h3 class="font-semibold text-purple-800 mb-2">Q${idx + 1}:</h3>
                            <div class="text-gray-700 whitespace-pre-wrap">${pair.question}</div>
                        </div>
                        <div class="md:col-span-2 bg-blue-50 p-4 rounded-lg">
                            <h3 class="font-semibold text-blue-800 mb-2">A${idx + 1}:</h3>
                            <div class="text-gray-700 whitespace-pre-wrap">${pair.answer}</div>
                        </div>
                    </div>
                `;
            });
            if (note.content.summary) {
                contentHtml += `
                    <div class="bg-green-50 p-4 rounded-lg mt-2">
                        <h3 class="font-semibold text-green-800 mb-2">Summary:</h3>
                        <div class="text-gray-700 whitespace-pre-wrap">${note.content.summary}</div>
                    </div>
                `;
            }
        } else {
            contentHtml += `<div class='mt-3 text-gray-500'>No Q&A pairs found.</div>`;
        }
    } else if (note.type === 'flashcard') {
        contentHtml += `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-yellow-50 p-4 rounded-lg border-2 border-yellow-200">
                    <h3 class="font-semibold text-yellow-800 mb-2">Front (Question):</h3>
                    <div class="text-gray-700 whitespace-pre-wrap">${note.content.front}</div>
                </div>
                <div class="bg-yellow-100 p-4 rounded-lg border-2 border-yellow-300">
                    <h3 class="font-semibold text-yellow-800 mb-2">Back (Answer):</h3>
                    <div class="text-gray-700 whitespace-pre-wrap">${note.content.back}</div>
                </div>
            </div>
        `;
    }

    
    contentHtml += `
        <div class="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-500">
            ${note.updatedAt && note.updatedAt !== note.createdAt ?
                `<p>Updated: ${new Date(note.updatedAt).toLocaleString()}</p>` :
            `<p>Created: ${new Date(note.createdAt).toLocaleString()}</p>` }
        </div>
    `;

    document.getElementById('viewModalContent').innerHTML = contentHtml;

    
    document.getElementById('editFromViewBtn').onclick = function() {
        closeViewModal();
        showEditModal(note);
    };

    document.getElementById('viewModal').classList.remove('hidden');
}

function closeViewModal() {
    document.getElementById('viewModal').classList.add('hidden');
}


function showCornellNoteModal(editNote = null) {
    document.getElementById('cornellModalTitle').textContent = editNote ? 'Edit Cornell Note' : 'Create Cornell Note';
    document.getElementById('cornellNoteForm').reset();
    const qaContainer = document.getElementById('cornellQAPairs');
    qaContainer.innerHTML = '';
    document.getElementById('cornellSummary').value = '';
    document.getElementById('cornellNoteTitle').value = '';
    document.getElementById('cornellNoteTags').value = '';

    if (editNote) {
        document.getElementById('cornellNoteTitle').value = editNote.title;
        document.getElementById('cornellNoteTags').value = editNote.tags.join(', ');
        if (editNote.content && Array.isArray(editNote.content.qa)) {
            for (const pair of editNote.content.qa) {
                addQAPair(pair.question, pair.answer);
            }
        }
        document.getElementById('cornellSummary').value = editNote.content.summary || '';
    } else {
        addQAPair();
    }
    document.getElementById('cornellNoteModal').classList.remove('hidden');
}

function closeCornellNoteModal() {
    document.getElementById('cornellNoteModal').classList.add('hidden');
}

function addQAPair(question = '', answer = '') {
    const qaContainer = document.getElementById('cornellQAPairs');
    const pairDiv = document.createElement('div');
    pairDiv.className = 'flex gap-2 items-start';
    pairDiv.innerHTML = `
        <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 mb-1">Question</label>
            <textarea class="cornellQAQuestion w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400" rows="2" placeholder="Cue/question...">${question}</textarea>
        </div>
        <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 mb-1">Answer</label>
            <textarea class="cornellQAAnswer w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400" rows="2" placeholder="Answer/notes...">${answer}</textarea>
        </div>
        <button type="button" class="removeQAPairBtn bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded mt-6">Remove</button>
    `;
    qaContainer.appendChild(pairDiv);
    pairDiv.querySelector('.removeQAPairBtn').onclick = function() {
        qaContainer.removeChild(pairDiv);
    };
}

document.getElementById('addQAPairBtn').onclick = function() {
    addQAPair();
};

document.getElementById('cornellNoteForm').onsubmit = async function(e) {
    e.preventDefault();
    const title = document.getElementById('cornellNoteTitle').value.trim();
    const tags = document.getElementById('cornellNoteTags').value.split(',').map(t => t.trim()).filter(t => t);
    const summary = document.getElementById('cornellSummary').value.trim();
    const qaPairs = [];
    const qaContainer = document.getElementById('cornellQAPairs');
    const questions = qaContainer.querySelectorAll('.cornellQAQuestion');
    const answers = qaContainer.querySelectorAll('.cornellQAAnswer');
    for (let i = 0; i < questions.length; i++) {
        const q = questions[i].value.trim();
        const a = answers[i].value.trim();
        if (q && a) qaPairs.push({ question: q, answer: a });
    }
    if (!title || qaPairs.length === 0) {
        alert('Title and at least one Q&A pair are required.');
        return;
    }
    const note = {
        type: 'cornell',
        title,
        tags,
        content: {
            qa: qaPairs,
            summary
        },
        updatedAt: new Date().toISOString()
    };
    if (currentEditingId) {
        note.id = currentEditingId;
    } else {
        note.createdAt = new Date().toISOString();
    }
    await saveNote(note);
    closeCornellNoteModal();
    loadNotes();
};


function showCreateModal(type) {
    if (type === 'cornell') {
        showCornellNoteModal();
    } else {
        currentNoteType = type;
        currentEditingId = null;
        document.getElementById('modalTitle').textContent = `Create ${type.charAt(0).toUpperCase() + type.slice(1)} Note`;

        
        document.querySelectorAll('.note-content').forEach(el => el.classList.add('hidden'));

        
        document.getElementById(type + 'Content').classList.remove('hidden');

        
        document.getElementById('noteForm').reset();

        document.getElementById('modal').classList.remove('hidden');
    }
}

function showEditModal(note) {
    currentNoteType = note.type;
    currentEditingId = note.id;
    document.getElementById('modalTitle').textContent = `Edit ${note.type.charAt(0).toUpperCase() + note.type.slice(1)} Note`;

    document.querySelectorAll('.note-content').forEach(el => el.classList.add('hidden'));

    if (note.type === 'cornell') {
        document.getElementById('cornellNoteForm').reset();
        const qaContainer = document.getElementById('cornellQAPairs');
        qaContainer.innerHTML = '';
        document.getElementById('cornellSummary').value = '';
        document.getElementById('cornellNoteTitle').value = '';
        document.getElementById('cornellNoteTags').value = '';
        document.getElementById('cornellModalTitle').textContent = 'Edit Cornell Note';
        document.getElementById('cornellNoteTitle').value = note.title;
        document.getElementById('cornellNoteTags').value = note.tags.join(', ');
        if (note.content && Array.isArray(note.content.qa)) {
            for (const pair of note.content.qa) {
                addQAPair(pair.question, pair.answer);
            }
        }
        document.getElementById('cornellSummary').value = note.content.summary || '';
        document.getElementById('cornellNoteModal').classList.remove('hidden');
        return;
    }

    document.getElementById(note.type + 'Content').classList.remove('hidden');
    document.getElementById('noteTitle').value = note.title;
    document.getElementById('noteTags').value = note.tags.join(', ');

    if (note.type === 'normal') {
        document.getElementById('normalText').value = note.content.text;
    } else if (note.type === 'flashcard') {
        document.getElementById('flashcardFront').value = note.content.front;
        document.getElementById('flashcardBack').value = note.content.back;
    }

    document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
    currentEditingId = null;
    
    document.getElementById('createNoteSelect').value = "";
    document.getElementById('importSelect').value = "";
}


function showImportFlashcardsModal() {
    document.getElementById('flashcardImportTextarea').value = '';
    document.getElementById('importFlashcardsModal').classList.remove('hidden');
}

function closeImportFlashcardsModal() {
    document.getElementById('importFlashcardsModal').classList.add('hidden');
    
    document.getElementById('createNoteSelect').value = "";
    document.getElementById('importSelect').value = "";
}

function showImportNotesModal() {
    document.getElementById('noteImportTextarea').value = '';
    document.getElementById('importNotesModal').classList.remove('hidden');
}

function closeImportNotesModal() {
    document.getElementById('importNotesModal').classList.add('hidden');
    
    document.getElementById('createNoteSelect').value = "";
    document.getElementById('importSelect').value = "";
}

function showImportCornellModal() {
    document.getElementById('cornellNoteImportTextarea').value = '';
    document.getElementById('importCornellNotesModal').classList.remove('hidden');
}

function closeImportCornellModal() {
    document.getElementById('importCornellNotesModal').classList.add('hidden');
    
    document.getElementById('createNoteSelect').value = "";
    document.getElementById('importSelect').value = "";
}


document.getElementById('noteForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const title = document.getElementById('noteTitle').value;
    const tags = document.getElementById('noteTags').value.split(',').map(tag => tag.trim()).filter(tag => tag);

    let content = {};

    if (currentNoteType === 'normal') {
        content.text = document.getElementById('normalText').value;
    } else if (currentNoteType === 'cornell') {
        content.cue = document.getElementById('cornellCue').value;
        content.notes = document.getElementById('cornellNotes').value;
        content.summary = document.getElementById('cornellSummary').value;
    } else if (currentNoteType === 'flashcard') {
        content.front = document.getElementById('flashcardFront').value;
        content.back = document.getElementById('flashcardBack').value;
    }

    const note = {
        title,
        type: currentNoteType,
        content,
        tags,
        createdAt: currentEditingId ? undefined : new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    if (currentEditingId) {
        note.id = currentEditingId;
    }

    try {
        await saveNote(note);
        closeModal();
        loadNotes();
    } catch (error) {
        console.error('Error saving note:', error);
        alert('Error saving note. Please try again.');
    }
});


document.getElementById('submitImportFlashcardsBtn').addEventListener('click', async function() {
    const inputText = document.getElementById('flashcardImportTextarea').value;
    const lines = inputText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    const flashcardsToSave = [];
    let currentFlashcard = {};

    for (const line of lines) {
        if (line.startsWith('N:')) {
            if (Object.keys(currentFlashcard).length > 0) {
                flashcardsToSave.push(currentFlashcard);
            }
            currentFlashcard = {
                type: 'flashcard',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                tags: []
            };
            currentFlashcard.title = line.substring(2).trim();
        } else if (line.startsWith('T:')) {
            currentFlashcard.tags = line.substring(2).split(',').map(tag => tag.trim()).filter(tag => tag);
        } else if (line.startsWith('Q:')) {
            currentFlashcard.content = currentFlashcard.content || {};
            currentFlashcard.content.front = line.substring(2).trim();
        } else if (line.startsWith('A:')) {
            currentFlashcard.content = currentFlashcard.content || {};
            currentFlashcard.content.back = line.substring(2).trim();
        }
    }
    if (Object.keys(currentFlashcard).length > 0) {
        flashcardsToSave.push(currentFlashcard);
    }

    let successCount = 0;
    let errorCount = 0;

    for (const flashcard of flashcardsToSave) {
        
        if (!flashcard.title || !flashcard.content || !flashcard.content.front || !flashcard.content.back) {
            console.warn('Skipping incomplete flashcard:', flashcard);
            errorCount++;
            continue;
        }
        try {
            await saveNote(flashcard);
            successCount++;
        } catch (error) {
            console.error('Error saving flashcard:', flashcard, error);
            errorCount++;
        }
    }

    closeImportFlashcardsModal();
    loadNotes();
    if (successCount > 0) {
        alert(`Successfully imported ${successCount} flashcard(s).`);
    }
    if (errorCount > 0) {
        alert(`Failed to import ${errorCount} flashcard(s) due to missing data or errors. Check console for details.`);
    }
});

document.getElementById('cancelImportFlashcardsBtn').addEventListener('click', closeImportFlashcardsModal);

document.getElementById('submitImportNotesBtn').addEventListener('click', async function() {
    const inputText = document.getElementById('noteImportTextarea').value;
    const lines = inputText.split('\n');

    const notesToSave = [];
    let currentNote = null;
    let currentField = null;
    let buffer = [];

    function flushField() {
        if (currentNote && currentField === 'C') {
            currentNote.content.text = buffer.join('\n').trim();
        }
        buffer = [];
        currentField = null;
    }

    for (const line of lines) {
        if (line.trim().startsWith('N:')) {
            if (currentNote) {
                flushField();
                notesToSave.push(currentNote);
            }
            currentNote = {
                type: 'normal',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                tags: [],
                content: {}
            };
            currentNote.title = line.substring(2).trim();
            currentField = null;
            buffer = [];
        } else if (line.trim().startsWith('T:')) {
            flushField();
            if (currentNote) {
                currentNote.tags = line.substring(2).split(',').map(tag => tag.trim()).filter(tag => tag);
            }
        } else if (line.trim().startsWith('C:')) {
            flushField();
            currentField = 'C';
            buffer.push(line.substring(2).trim());
        } else {
            if (currentField) {
                buffer.push(line);
            }
        }
    }
    if (currentNote) {
        flushField();
        notesToSave.push(currentNote);
    }

    let successCount = 0;
    let errorCount = 0;

    for (const note of notesToSave) {
        if (!note.title || !note.content || !note.content.text) {
            console.warn('Skipping incomplete normal note:', note);
            errorCount++;
            continue;
        }
        try {
            await saveNote(note);
            successCount++;
        } catch (error) {
            console.error('Error saving normal note:', note, error);
            errorCount++;
        }
    }

    closeImportNotesModal();
    loadNotes();
    if (successCount > 0) {
        alert(`Successfully imported ${successCount} normal note(s).`);
    }
    if (errorCount > 0) {
        alert(`Failed to import ${errorCount} normal note(s) due to missing data or errors. Check console for details.`);
    }
});

document.getElementById('cancelImportNotesBtn').addEventListener('click', closeImportNotesModal);

document.getElementById('submitImportCornellNotesBtn').addEventListener('click', async function() {
    const inputText = document.getElementById('cornellNoteImportTextarea').value;
    const lines = inputText.split('\n');

    const cornellNotesToSave = [];
    let currentCornellNote = null;
    let currentField = null;
    let buffer = [];
    let qaPairs = [];
    let currentQA = null;

    function flushCornellField() {
        if (!currentCornellNote) return;
        if (currentField === 'Q') {
            if (currentQA) {
                currentQA.question = buffer.join('\n').trim();
            }
        } else if (currentField === 'A' || currentField === 'M') {
            if (currentQA) {
                currentQA.answer = buffer.join('\n').trim();
                qaPairs.push(currentQA);
                currentQA = null;
            }
        } else if (currentField === 'S') {
            currentCornellNote.content.summary = buffer.join('\n').trim();
        }
        buffer = [];
        currentField = null;
    }

    for (const line of lines) {
        if (line.trim().startsWith('N:')) {
            if (currentCornellNote) {
                flushCornellField();
                if (qaPairs.length > 0) {
                    currentCornellNote.content.qa = qaPairs;
                }
                cornellNotesToSave.push(currentCornellNote);
            }
            currentCornellNote = {
                type: 'cornell',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                tags: [],
                content: {}
            };
            qaPairs = [];
            currentQA = null;
            currentField = null;
            buffer = [];
            currentCornellNote.title = line.substring(2).trim();
        } else if (line.trim().startsWith('T:')) {
            flushCornellField();
            if (currentCornellNote) {
                currentCornellNote.tags = line.substring(2).split(',').map(tag => tag.trim()).filter(tag => tag);
            }
        } else if (line.trim().startsWith('Q:')) {
            flushCornellField();
            currentField = 'Q';
            currentQA = { question: '', answer: '' };
            buffer.push(line.substring(2).trim());
        } else if (line.trim().startsWith('A:') || line.trim().startsWith('M:')) {
            flushCornellField();
            currentField = 'A';
            buffer.push(line.substring(2).trim());
        } else if (line.trim().startsWith('S:')) {
            flushCornellField();
            currentField = 'S';
            buffer.push(line.substring(2).trim());
        } else {
            if (currentField) {
                buffer.push(line);
            }
        }
    }
    if (currentCornellNote) {
        flushCornellField();
        if (qaPairs.length > 0) {
            currentCornellNote.content.qa = qaPairs;
        }
        cornellNotesToSave.push(currentCornellNote);
    }

    let successCount = 0;
    let errorCount = 0;

    for (const cornellNote of cornellNotesToSave) {
        if (!cornellNote.title || !cornellNote.content || !cornellNote.content.qa || cornellNote.content.qa.length === 0) {
            console.warn('Skipping incomplete Cornell note:', cornellNote);
            errorCount++;
            continue;
        }
        try {
            await saveNote(cornellNote);
            successCount++;
        } catch (error) {
            console.error('Error saving Cornell note:', cornellNote, error);
            errorCount++;
        }
    }

    closeImportCornellModal();
    loadNotes();
    if (successCount > 0) {
        alert(`Successfully imported ${successCount} Cornell note(s).`);
    }
    if (errorCount > 0) {
        alert(`Failed to import ${errorCount} Cornell note(s) due to missing data or errors. Check console for details.`);
    }
});

document.getElementById('cancelImportCornellNotesBtn').addEventListener('click', closeImportCornellModal);

async function loadNotes() {
    try {
        const notes = await getAllNotes();
        displayNotes(notes);
    } catch (error) {
        console.error('Error loading notes:', error);
    }
}

function displayNotes(notes) {
    const container = document.getElementById('notesContainer');
    container.innerHTML = '';

    notes.forEach(note => {
        const noteElement = createNoteElement(note);
        container.appendChild(noteElement);
    });

    
    addDragAndDropListeners();
}

function createNoteElement(note) {
    const div = document.createElement('div');
    div.className = 'note-card bg-white rounded-lg shadow-md p-4 cursor-move';
    div.draggable = true;
    div.dataset.noteId = note.id;
    div.dataset.noteType = note.type;
    div.dataset.noteJson = encodeURIComponent(JSON.stringify(note));

    
    const typeColors = {
        normal: 'border-l-4 border-blue-400',
        cornell: 'border-l-4 border-green-400',
        flashcard: 'border-l-4 border-yellow-400'
    };

    div.className += ' ' + typeColors[note.type];

    let contentHtml = '';

    if (note.type === 'normal') {
        contentHtml = `
            <div class="mt-3">
                <p class="text-gray-700 whitespace-pre-wrap">${note.content.text.substring(0, 150)}${note.content.text.length > 150 ? '...' : ''}</p>
            </div>
        `;
    } else if (note.type === 'cornell') {
        if (Array.isArray(note.content.qa)) {
            contentHtml = `<div class='mt-3 space-y-2'>`;
            note.content.qa.forEach((pair, idx) => {
                contentHtml += `
                    <div class="grid grid-cols-3 gap-2 text-sm">
                        <div class="bg-purple-50 p-2 rounded">
                            <strong>Q${idx + 1}:</strong>
                            <p class="text-gray-600">${pair.question.substring(0, 50)}${pair.question.length > 50 ? '...' : ''}</p>
                        </div>
                        <div class="col-span-2 bg-blue-50 p-2 rounded">
                            <strong>A${idx + 1}:</strong>
                            <p class="text-gray-600">${pair.answer.substring(0, 100)}${pair.answer.length > 100 ? '...' : ''}</p>
                        </div>
                    </div>
                `;
            });
            if (note.content.summary) {
                contentHtml += `<div class='bg-green-50 p-2 rounded'><strong>Summary:</strong> <span class='text-gray-600 cornell-summary-preview'>${note.content.summary}</span></div>`;
            }
            contentHtml += `</div>`;
        } else {
            contentHtml = `<div class='mt-3 text-gray-500'>No Q&A pairs found.</div>`;
        }
    } else if (note.type === 'flashcard') {
        contentHtml = `
            <div class="mt-3 flashcard" onclick="flipCard(this)">
                <div class="flashcard-inner">
                    <div class="flashcard-front bg-yellow-50 border-2 border-yellow-200 p-2 rounded flex items-center justify-center min-h-[80px]">
                        <p class="text-center font-medium">${note.content.front}</p>
                    </div>
                    <div class="flashcard-back bg-yellow-100 border-2 border-yellow-300 p-2 rounded flex items-center justify-center min-h-[80px]">
                        <p class="text-center">${note.content.back}</p>
                    </div>
                </div>
            </div>
        `;
    }

    div.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <h3 class="font-semibold text-gray-800 truncate cursor-pointer hover:text-purple-600 view-note-trigger" title="Click to view full note">${note.title}</h3>
                <div class="flex gap-1 ml-2">
                <button class="text-blue-500 hover:text-blue-700 text-sm edit-note-trigger" title="Edit note">✎</button>
                <button onclick="confirmDelete(${note.id})" class="text-red-500 hover:text-red-700 text-sm" title="Delete note">🗑</button>
            </div>
        </div>
        <div class="flex gap-1 mb-2">
            <span class="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">${note.type}</span>
            ${note.tags.map(tag => `<span class="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">${tag}</span>`).join('')}
        </div>
        <div class="cursor-pointer view-note-trigger">
            ${contentHtml}
        </div>
        <div class="mt-3 text-xs text-gray-500">
            ${new Date(note.updatedAt || note.createdAt).toLocaleDateString()}
        </div>
    `;

    // Add event listeners for view and edit
    div.querySelectorAll('.view-note-trigger').forEach(el => {
        el.addEventListener('click', function(e) {
            e.stopPropagation();
            const noteObj = JSON.parse(decodeURIComponent(div.dataset.noteJson));
            showViewModal(noteObj);
        });
    });
    div.querySelector('.edit-note-trigger').addEventListener('click', function(e) {
        e.stopPropagation();
        const noteObj = JSON.parse(decodeURIComponent(div.dataset.noteJson));
        showEditModal(noteObj);
    });
    return div;
}


function flipCard(element) {
    element.classList.toggle('flipped');
}


async function confirmDelete(id) {
    if (confirm('Are you sure you want to delete this note?')) {
        try {
            await deleteNote(id);
            loadNotes();
        } catch (error) {
            console.error('Error deleting note:', error);
            alert('Error deleting note. Please try again.');
        }
    }
}


document.getElementById('searchInput').addEventListener('input', filterNotes);
document.getElementById('tagFilter').addEventListener('input', filterNotes);

async function filterNotes() {
    const searchTerm = document.getElementById('searchInput').value.toLocaleLowerCase();
    const tagFilter = document.getElementById('tagFilter').value.toLocaleLowerCase();

    try {
        const allNotes = await getAllNotes();
        const filteredNotes = allNotes.filter(note => {
            const matchesSearch = !searchTerm ||
                note.title.toLocaleLowerCase().includes(searchTerm) ||
                JSON.stringify(note.content).toLocaleLowerCase().includes(searchTerm);

            const matchesTag = !tagFilter ||
                note.tags.some(tag => tag.toLocaleLowerCase().includes(tagFilter));

            return matchesSearch && matchesTag;
        });

        displayNotes(filteredNotes);
    } catch (error) {
        console.error('Error filtering notes:', error);
    }
}


function addDragAndDropListeners() {
    const noteCards = document.querySelectorAll('.note-card');

    noteCards.forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
        card.addEventListener('dragover', handleDragOver);
        card.addEventListener('drop', handleDrop);
        card.addEventListener('dragenter', handleDragEnter);
        card.addEventListener('dragleave', handleDragLeave);
    });
}

let draggedElement = null;

function handleDragStart(e) {
    draggedElement = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.outerHTML);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    draggedElement = null;
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    this.classList.add('drag-over');
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }

    this.classList.remove('drag-over');

    if (draggedElement !== this) {
        const container = document.getElementById('notesContainer');
        const afterElement = getDragAfterElement(container, e.clientY);

        if (afterElement == null) {
            container.appendChild(draggedElement);
        } else {
            container.insertBefore(draggedElement, afterElement);
        }
    }

    return false;
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.note-card:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}



document.getElementById('createNoteSelect').addEventListener('change', function() {
    const selectedType = this.value;
    if (selectedType) {
        showCreateModal(selectedType);
        this.value = ""; 
    }
});

document.getElementById('importSelect').addEventListener('change', function() {
    const selectedOption = this.value;
    if (selectedOption === 'flashcards') {
        showImportFlashcardsModal();
    } else if (selectedOption === 'normal') { 
        showImportNotesModal();
    } else if (selectedOption === 'cornell') { 
        showImportCornellModal();
    }
    this.value = ""; 
});


function showFlashcardReviewModal(flashcards) {
    reviewFlashcards = flashcards;
    currentReviewIndex = 0;
    isReviewFlipped = false;
    renderReviewFlashcard();
    document.getElementById('flashcardReviewModal').classList.remove('hidden');
}

function closeFlashcardReviewModal() {
    document.getElementById('flashcardReviewModal').classList.add('hidden');
}

function renderReviewFlashcard() {
    const container = document.getElementById('flashcardReviewContent');
    if (!reviewFlashcards.length) {
        container.innerHTML = '<div class="text-gray-500">No flashcards found for this tag.</div>';
        document.getElementById('flipReviewFlashcardBtn').style.display = 'none';
        document.getElementById('prevFlashcardBtn').style.visibility = 'hidden';
        document.getElementById('nextFlashcardBtn').style.visibility = 'hidden';
        return;
    }
    const card = reviewFlashcards[currentReviewIndex];
    document.getElementById('flipReviewFlashcardBtn').style.display = '';
    document.getElementById('prevFlashcardBtn').style.visibility = reviewFlashcards.length > 1 ? '' : 'hidden';
    document.getElementById('nextFlashcardBtn').style.visibility = reviewFlashcards.length > 1 ? '' : 'hidden';
    container.innerHTML = `
        <div class="w-full">
            <div class="flashcard ${isReviewFlipped ? 'flipped' : ''}" style="height:180px;">
                <div class="flashcard-inner" style="height:180px;">
                    <div class="flashcard-front bg-yellow-50 border-2 border-yellow-200 p-2 rounded flex items-center justify-center min-h-[80px]">
                        <p class="text-center font-medium">${renderImages(card.content.front)}</p>
                    </div>
                    <div class="flashcard-back bg-yellow-100 border-2 border-yellow-300 p-2 rounded flex items-center justify-center min-h-[80px]">
                        <p class="text-center">${renderImages(card.content.back)}</p>
                    </div>
                </div>
            </div>
            <div class="text-center mt-2 text-xs text-gray-400">${currentReviewIndex + 1} / ${reviewFlashcards.length}</div>
        </div>
    `;
}

document.getElementById('reviewFlashcardsBtn').onclick = async function() {
    const tag = document.getElementById('tagFilter').value.trim().toLocaleLowerCase();
    const allNotes = await getAllNotes();
    const flashcards = allNotes.filter(note => note.type === 'flashcard' && (!tag || note.tags.some(t => t.toLocaleLowerCase().includes(tag))));
    showFlashcardReviewModal(flashcards);
};

document.getElementById('closeFlashcardReviewModal').onclick = closeFlashcardReviewModal;
document.getElementById('prevFlashcardBtn').onclick = function() {
    if (!reviewFlashcards.length) return;
    currentReviewIndex = (currentReviewIndex - 1 + reviewFlashcards.length) % reviewFlashcards.length;
    isReviewFlipped = false;
    renderReviewFlashcard();
};
document.getElementById('nextFlashcardBtn').onclick = function() {
    if (!reviewFlashcards.length) return;
    currentReviewIndex = (currentReviewIndex + 1) % reviewFlashcards.length;
    isReviewFlipped = false;
    renderReviewFlashcard();
};
document.getElementById('flipReviewFlashcardBtn').onclick = function() {
    isReviewFlipped = !isReviewFlipped;
    renderReviewFlashcard();
};

initDB();

