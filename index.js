
// Database setup
let db;
const dbName = 'NotesDB';
const dbVersion = 1;
let currentEditingId = null;
let currentNoteType = 'normal';

// Initialize IndexedDB
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

// Save note to database
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

// Get all notes from database
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

// Delete note from database
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

// View Modal functions
function showViewModal(note) {
    document.getElementById('viewModalTitle').textContent = note.title;

    let contentHtml = '';

    // Display tags
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

    // Display content based on note type
    if (note.type === 'normal') {
        contentHtml += `
                    <div class="bg-blue-50 p-4 rounded-lg">
                        <h3 class="font-semibold text-blue-800 mb-2">Content:</h3>
                        <div class="text-gray-700 whitespace-pre-wrap">${note.content.text}</div>
                    </div>
                `;
    } else if (note.type === 'cornell') {
        contentHtml += `
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div class="bg-purple-50 p-4 rounded-lg">
                            <h3 class="font-semibold text-purple-800 mb-2">Cue Column:</h3>
                            <div class="text-gray-700 whitespace-pre-wrap">${note.content.cue}</div>
                        </div>
                        <div class="md:col-span-2 bg-blue-50 p-4 rounded-lg">
                            <h3 class="font-semibold text-blue-800 mb-2">Note-taking Area:</h3>
                            <div class="text-gray-700 whitespace-pre-wrap">${note.content.notes}</div>
                        </div>
                    </div>
                    <div class="bg-green-50 p-4 rounded-lg">
                        <h3 class="font-semibold text-green-800 mb-2">Summary:</h3>
                        <div class="text-gray-700 whitespace-pre-wrap">${note.content.summary}</div>
                    </div>
                `;
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

    // Add creation/update date
    contentHtml += `
                <div class="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-500">
                    ${note.updatedAt && note.updatedAt !== note.createdAt ? 
                            `<p>Updated: ${new Date(note.updatedAt).toLocaleString()}</p>` :
                    `<p>Created: ${new Date(note.createdAt).toLocaleString()}</p>` }
                </div>
            `;

    document.getElementById('viewModalContent').innerHTML = contentHtml;

    // Set up edit button
    document.getElementById('editFromViewBtn').onclick = function() {
        closeViewModal();
        showEditModal(note);
    };

    document.getElementById('viewModal').classList.remove('hidden');
}

function closeViewModal() {
    document.getElementById('viewModal').classList.add('hidden');
}

// Modal functions
function showCreateModal(type) {
    currentNoteType = type;
    currentEditingId = null;
    document.getElementById('modalTitle').textContent = `Create ${type.charAt(0).toUpperCase() + type.slice(1)} Note`;

    // Hide all content sections
    document.querySelectorAll('.note-content').forEach(el => el.classList.add('hidden'));

    // Show relevant content section
    document.getElementById(type + 'Content').classList.remove('hidden');

    // Clear form
    document.getElementById('noteForm').reset();

    document.getElementById('modal').classList.remove('hidden');
}

function showEditModal(note) {
    currentNoteType = note.type;
    currentEditingId = note.id;
    document.getElementById('modalTitle').textContent = `Edit ${note.type.charAt(0).toUpperCase() + note.type.slice(1)} Note`;

    // Hide all content sections
    document.querySelectorAll('.note-content').forEach(el => el.classList.add('hidden'));

    // Show relevant content section
    document.getElementById(note.type + 'Content').classList.remove('hidden');

    // Populate form
    document.getElementById('noteTitle').value = note.title;
    document.getElementById('noteTags').value = note.tags.join(', ');

    if (note.type === 'normal') {
        document.getElementById('normalText').value = note.content.text;
    } else if (note.type === 'cornell') {
        document.getElementById('cornellCue').value = note.content.cue;
        document.getElementById('cornellNotes').value = note.content.notes;
        document.getElementById('cornellSummary').value = note.content.summary;
    } else if (note.type === 'flashcard') {
        document.getElementById('flashcardFront').value = note.content.front;
        document.getElementById('flashcardBack').value = note.content.back;
    }

    document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
    currentEditingId = null;
}

// Form submission
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

// Load and display notes
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

    // Add drag and drop functionality
    addDragAndDropListeners();
}

function createNoteElement(note) {
    const div = document.createElement('div');
    div.className = 'note-card bg-white rounded-lg shadow-md p-4 cursor-move';
    div.draggable = true;
    div.dataset.noteId = note.id;
    div.dataset.noteType = note.type;

    // Color coding by type
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
        contentHtml = `
                    <div class="mt-3 grid grid-cols-3 gap-2 text-sm">
                        <div class="bg-purple-50 p-2 rounded">
                            <strong>Cue:</strong>
                            <p class="text-gray-600">${note.content.cue.substring(0, 50)}${note.content.cue.length > 50 ? '...' : ''}</p>
                        </div>
                        <div class="col-span-2 bg-blue-50 p-2 rounded">
                            <strong>Notes:</strong>
                            <p class="text-gray-600">${note.content.notes.substring(0, 100)}${note.content.notes.length > 100 ? '...' : ''}</p>
                        </div>
                    </div>
                `;
    } else if (note.type === 'flashcard') {
        contentHtml = `
                    <div class="mt-3 flashcard" onclick="flipCard(this)">
                        <div class="flashcard-inner">
                            <div class="flashcard-front bg-yellow-50 border-2 border-yellow-200">
                                <p class="text-center">${note.content.front}</p>
                            </div>
                            <div class="flashcard-back bg-yellow-100 border-2 border-yellow-300">
                                <p class="text-center">${note.content.back}</p>
                            </div>
                        </div>
                    </div>
                `;
    }

    div.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-semibold text-gray-800 truncate cursor-pointer hover:text-purple-600" onclick='showViewModal(${JSON.stringify(note).replace(/'/g, "\\'")})' title="Click to view full note">${note.title}</h3>
                        <div class="flex gap-1 ml-2">
                        <button onclick='showEditModal(${JSON.stringify(note).replace(/'/g, "\\'")})' class="text-blue-500 hover:text-blue-700 text-sm" title="Edit note">✎</button>
                        <button onclick="confirmDelete(${note.id})" class="text-red-500 hover:text-red-700 text-sm" title="Delete note">🗑</button>
                    </div>
                </div>
                <div class="flex gap-1 mb-2">
                    <span class="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">${note.type}</span>
                    ${note.tags.map(tag => `<span class="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">${tag}</span>`).join('')}
                </div>
                <div onclick='showViewModal(${JSON.stringify(note).replace(/'/g, "\\'")})' class="cursor-pointer">
                    ${contentHtml}
                </div>
                <div class="mt-3 text-xs text-gray-500">
                    ${new Date(note.updatedAt || note.createdAt).toLocaleDateString()}
                </div>
            `;

                    return div;
}

// Flashcard flip functionality
function flipCard(element) {
    element.classList.toggle('flipped');
}

// Delete functionality
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

// Search and filter functionality
document.getElementById('searchInput').addEventListener('input', filterNotes);
document.getElementById('tagFilter').addEventListener('input', filterNotes);

async function filterNotes() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const tagFilter = document.getElementById('tagFilter').value.toLowerCase();

    try {
        const allNotes = await getAllNotes();
        const filteredNotes = allNotes.filter(note => {
            const matchesSearch = !searchTerm || 
                note.title.toLowerCase().includes(searchTerm) ||
                JSON.stringify(note.content).toLowerCase().includes(searchTerm);

            const matchesTag = !tagFilter || 
                note.tags.some(tag => tag.toLowerCase().includes(tagFilter));

            return matchesSearch && matchesTag;
        });

        displayNotes(filteredNotes);
    } catch (error) {
        console.error('Error filtering notes:', error);
    }
}

// Drag and drop functionality
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

// Initialize the app
initDB();
