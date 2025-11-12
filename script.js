// Initialize Supabase client
const supabaseUrl = 'https://sdsuokxtudyyfrijzhia.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3Vva3h0dWR5eWZyaWp6aGlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0MTAzNTYsImV4cCI6MjA3NDk4NjM1Nn0.jcL8x6_t5bGLeUg21mWwfcgIHctXJJmLsMPFQuKopbs';

// Get createClient from the global object
const supabaseClient = window.supabase.createClient;
const supabase = supabaseClient(supabaseUrl, supabaseKey);

// Camera streams and photo data
let arrivalStream = null;
let pickupStream = null;
let arrivalPhotosData = [];
let pickupPhotosData = [];

// For image viewer modal
let currentImages = [];
let currentImageIndex = 0;

// Flag to prevent duplicate submissions
let isProcessing = false;

// Realtime subscription channels
let materialsSubscription = null;
let historySubscription = null;

// En el JavaScript, agregar sistema de notificaciones persistentes
class NotificationSystem {
    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'notifications-container';
        document.body.appendChild(this.container);
    }

    show(message, type = 'info', duration = 5000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${this.getIcon(type)}</span>
                <span class="notification-message">${message}</span>
            </div>
            <button class="notification-close">&times;</button>
        `;

        this.container.appendChild(notification);

        // Auto remove
        if (duration > 0) {
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, duration);
        }

        // Close button
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });

        return notification;
    }

    getIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || icons.info;
    }
}

// Sistema de validación mejorado
function setupFormValidation() {
    const form = document.getElementById('materialForm');
    const inputs = form.querySelectorAll('input[required], select[required]');
    
    inputs.forEach(input => {
        input.addEventListener('blur', validateField);
        input.addEventListener('input', clearFieldError);
    });
}

function validateField(e) {
    const field = e.target;
    const value = field.value.trim();
    
    clearFieldError(e);
    
    if (!value) {
        showFieldError(field, 'Este campo es obligatorio');
        return false;
    }
    
    if (field.type === 'number' && parseInt(value) < 1) {
        showFieldError(field, 'La cantidad debe ser mayor a 0');
        return false;
    }
    
    return true;
}

function showFieldError(field, message) {
    field.classList.add('error');
    let errorElement = field.parentNode.querySelector('.field-error');
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.className = 'field-error';
        field.parentNode.appendChild(errorElement);
    }
    errorElement.textContent = message;
}

function clearFieldError(e) {
    const field = e.target;
    field.classList.remove('error');
    const errorElement = field.parentNode.querySelector('.field-error');
    if (errorElement) {
        errorElement.remove();
    }
}


// Supabase database functions
async function addMaterial(material) {
    try {
        const { data, error } = await supabase
            .from('materials')
            .insert([material])
            .select();
        
        if (error) throw error;
        return data[0].id;
    } catch (error) {
        console.error('Error adding material:', error);
        throw error;
    }
}

async function getAllMaterials() {
    const { data, error } = await supabase
        .from('materials')
        .select('*')
        .order('created_at', { ascending: false });
        
    if (error) {
        console.error('Error fetching materials:', error);
        throw error;
    }
    
    return data;
}

async function updateMaterial(id, updates) {
    const { data, error } = await supabase
        .from('materials')
        .update(updates)
        .eq('id', id)
        .select();
        
    if (error) {
        console.error('Error updating material:', error);
        throw error;
    }
    
    return data;
}

async function addHistoryRecord(record) {
    const { data, error } = await supabase
        .from('history')
        .insert([record])
        .select();
        
    if (error) {
        console.error('Error adding history record:', error);
        throw error;
    }
    
    return data;
}

async function getMaterialHistory(materialId) {
    const { data, error } = await supabase
        .from('history')
        .select('*')
        .eq('material_id', materialId)
        .order('date', { ascending: false });
        
    if (error) {
        console.error('Error fetching material history:', error);
        throw error;
    }
    
    return data;
}

// Realtime subscriptions
function setupRealtimeSubscriptions() {
    // Subscribe to materials table changes
    materialsSubscription = supabase
        .channel('materials-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'materials'
            },
            (payload) => {
                console.log('Material change received:', payload);
                if (document.getElementById('materials').classList.contains('active')) {
                    loadMaterialsTable();
                }
                if (document.getElementById('history').classList.contains('active')) {
                    loadMaterialsForHistory();
                }
                
                // Show notification for new materials
                if (payload.eventType === 'INSERT') {
                    showRealtimeNotification(`Nuevo material agregado: ${payload.new.name}`);
                } else if (payload.eventType === 'UPDATE' && payload.new.status === 'taken') {
                    showRealtimeNotification(`Material retirado: ${payload.new.name}`);
                }
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Materials subscription active');
            }
        });
    
    // Subscribe to history table changes
    historySubscription = supabase
        .channel('history-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'history'
            },
            (payload) => {
                console.log('History change received:', payload);
                if (document.getElementById('history').classList.contains('active')) {
                    const selectedMaterialId = document.getElementById('historyMaterialSelect').value;
                    if (selectedMaterialId && payload.new && payload.new.material_id == selectedMaterialId) {
                        loadMaterialHistory(selectedMaterialId);
                    }
                }
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('History subscription active');
            }
        });
}

function cleanupRealtimeSubscriptions() {
    if (materialsSubscription) {
        supabase.removeChannel(materialsSubscription);
    }
    if (historySubscription) {
        supabase.removeChannel(historySubscription);
    }
}

function showRealtimeNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'realtime-notification';
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">×</button>
    `;
    
    // Add styles if not already added
    if (!document.querySelector('#realtime-notification-styles')) {
        const styles = document.createElement('style');
        styles.id = 'realtime-notification-styles';
        styles.textContent = `
            .realtime-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                background: #28a745;
                color: white;
                padding: 12px 16px;
                border-radius: 4px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 10000;
                display: flex;
                align-items: center;
                gap: 10px;
                animation: slideIn 0.3s ease;
                max-width: 300px;
            }
            .realtime-notification button {
                background: none;
                border: none;
                color: white;
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(styles);
    }
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Camera functions
async function startArrivalCamera() {
    try {
        console.log('Starting arrival camera...');
        
        if (arrivalStream) {
            arrivalStream.getTracks().forEach(track => track.stop());
        }
        
        const constraints = {
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }, 
            audio: false 
        };
        
        arrivalStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        const video = document.getElementById('arrivalVideo');
        video.srcObject = arrivalStream;
        video.style.display = 'block';
        
        const preview = document.getElementById('arrivalCameraPreview');
        const placeholder = preview.querySelector('span');
        if (placeholder) placeholder.style.display = 'none';
        
        document.getElementById('captureArrivalPhoto').disabled = false;
        document.getElementById('stopArrivalCamera').disabled = false;
        
        console.log('Arrival camera started successfully');
        
    } catch (error) {
        console.error('Error accessing camera:', error);
        
        try {
            console.log('Trying with basic constraints...');
            arrivalStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            
            const video = document.getElementById('arrivalVideo');
            video.srcObject = arrivalStream;
            video.style.display = 'block';
            
            const preview = document.getElementById('arrivalCameraPreview');
            const placeholder = preview.querySelector('span');
            if (placeholder) placeholder.style.display = 'none';
            
            document.getElementById('captureArrivalPhoto').disabled = false;
            document.getElementById('stopArrivalCamera').disabled = false;
            
            console.log('Arrival camera started with basic constraints');
        } catch (fallbackError) {
            console.error('Fallback camera access failed:', fallbackError);
            alert('Error accessing camera. Por favor asegúrese de haber otorgado los permisos y estar usando una conexión segura (HTTPS).');
        }
    }
}

function stopArrivalCamera() {
    if (arrivalStream) {
        arrivalStream.getTracks().forEach(track => track.stop());
        arrivalStream = null;
        
        const video = document.getElementById('arrivalVideo');
        video.style.display = 'none';
        video.srcObject = null;
        
        const preview = document.getElementById('arrivalCameraPreview');
        const placeholder = preview.querySelector('span');
        if (placeholder) placeholder.style.display = 'block';
        
        document.getElementById('captureArrivalPhoto').disabled = true;
        document.getElementById('stopArrivalCamera').disabled = true;
        
        console.log('Arrival camera stopped');
    }
}

function captureArrivalPhoto() {
    const video = document.getElementById('arrivalVideo');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const photoData = canvas.toDataURL('image/jpeg');
    
    arrivalPhotosData.push(photoData);
    
    displayCapturedPhoto(photoData, 'arrivalPhotosContainer', 'arrival');
    
    console.log('Arrival photo captured');
}

async function startPickupCamera() {
    try {
        console.log('Starting pickup camera...');
        
        if (pickupStream) {
            pickupStream.getTracks().forEach(track => track.stop());
        }
        
        const constraints = {
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }, 
            audio: false 
        };
        
        pickupStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        const video = document.getElementById('pickupVideo');
        video.srcObject = pickupStream;
        video.style.display = 'block';
        
        const preview = document.getElementById('pickupCameraPreview');
        const placeholder = preview.querySelector('span');
        if (placeholder) placeholder.style.display = 'none';
        
        document.getElementById('capturePickupPhoto').disabled = false;
        document.getElementById('stopPickupCamera').disabled = false;
        
        console.log('Pickup camera started successfully');
        
    } catch (error) {
        console.error('Error accessing camera:', error);
        
        try {
            console.log('Trying with basic constraints...');
            pickupStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            
            const video = document.getElementById('pickupVideo');
            video.srcObject = pickupStream;
            video.style.display = 'block';
            
            const preview = document.getElementById('pickupCameraPreview');
            const placeholder = preview.querySelector('span');
            if (placeholder) placeholder.style.display = 'none';
            
            document.getElementById('capturePickupPhoto').disabled = false;
            document.getElementById('stopPickupCamera').disabled = false;
            
            console.log('Pickup camera started with basic constraints');
        } catch (fallbackError) {
            console.error('Fallback camera access failed:', fallbackError);
            alert('Error accessing camera. Por favor asegúrese de haber otorgado los permisos y estar usando una conexión segura (HTTPS).');
        }
    }
}

function stopPickupCamera() {
    if (pickupStream) {
        pickupStream.getTracks().forEach(track => track.stop());
        pickupStream = null;
        
        const video = document.getElementById('pickupVideo');
        video.style.display = 'none';
        video.srcObject = null;
        
        const preview = document.getElementById('pickupCameraPreview');
        const placeholder = preview.querySelector('span');
        if (placeholder) placeholder.style.display = 'block';
        
        document.getElementById('capturePickupPhoto').disabled = true;
        document.getElementById('stopPickupCamera').disabled = true;
        
        console.log('Pickup camera stopped');
    }
}

function capturePickupPhoto() {
    const video = document.getElementById('pickupVideo');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const photoData = canvas.toDataURL('image/jpeg');
    
    pickupPhotosData.push(photoData);
    
    displayCapturedPhoto(photoData, 'pickupPhotosContainer', 'pickup');
    
    console.log('Pickup photo captured');
}

function displayCapturedPhoto(photoData, containerId, type) {
    const container = document.getElementById(containerId);
    
    const photoItem = document.createElement('div');
    photoItem.className = 'captured-photo-item';
    
    const img = document.createElement('img');
    img.src = photoData;
    img.alt = 'Captured photo';
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-photo';
    removeBtn.innerHTML = '×';
    removeBtn.onclick = function(e) {
        e.stopPropagation();
        removePhoto(photoData, containerId, type);
        photoItem.remove();
    };
    
    img.onclick = function() {
        openImageViewer([photoData], 0);
    };
    
    photoItem.appendChild(img);
    photoItem.appendChild(removeBtn);
    container.appendChild(photoItem);
}

function removePhoto(photoData, containerId, type) {
    if (type === 'arrival') {
        arrivalPhotosData = arrivalPhotosData.filter(photo => photo !== photoData);
    } else if (type === 'pickup') {
        pickupPhotosData = pickupPhotosData.filter(photo => photo !== photoData);
    }
}

function openImageViewer(images, index) {
    currentImages = images;
    currentImageIndex = index;
    
    const modal = document.getElementById('imageViewerModal');
    const modalImage = document.getElementById('modalImage');
    const imageCounter = document.getElementById('imageCounter');
    
    modalImage.src = currentImages[currentImageIndex];
    imageCounter.textContent = `${currentImageIndex + 1} / ${currentImages.length}`;
    
    modal.style.display = 'block';
}

function closeImageViewer() {
    const modal = document.getElementById('imageViewerModal');
    modal.style.display = 'none';
}

function prevImage() {
    if (currentImages.length > 1) {
        currentImageIndex = (currentImageIndex - 1 + currentImages.length) % currentImages.length;
        document.getElementById('modalImage').src = currentImages[currentImageIndex];
        document.getElementById('imageCounter').textContent = `${currentImageIndex + 1} / ${currentImages.length}`;
    }
}

function nextImage() {
    if (currentImages.length > 1) {
        currentImageIndex = (currentImageIndex + 1) % currentImages.length;
        document.getElementById('modalImage').src = currentImages[currentImageIndex];
        document.getElementById('imageCounter').textContent = `${currentImageIndex + 1} / ${currentImages.length}`;
    }
}

function formatDate(date) {
    return new Date(date).toLocaleString();
}

function showProcessingOverlay() {
    document.getElementById('processingOverlay').style.display = 'flex';
}

function hideProcessingOverlay() {
    document.getElementById('processingOverlay').style.display = 'none';
}

// UI Functions
function showSection(sectionId) {
    console.log('Switching to section:', sectionId);
    
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    } else {
        console.error('Section not found:', sectionId);
        return;
    }
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeButton = document.querySelector(`[data-section="${sectionId}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }
    
    if (sectionId === 'materials') {
        loadMaterialsTable();
    } else if (sectionId === 'history') {
        loadMaterialsForHistory();
    }
}

async function loadMaterialsTable() {
    try {
        const materials = await getAllMaterials();
        const tableBody = document.getElementById('materialsTableBody');
        const emptyState = document.getElementById('emptyMaterials');
        
        tableBody.innerHTML = '';
        
        if (materials.length === 0) {
            emptyState.style.display = 'block';
            return;
        }
        
        emptyState.style.display = 'none';
        
        materials.forEach(material => {
            const row = document.createElement('tr');
            
            const firstPhoto = material.arrival_photos && material.arrival_photos.length > 0 
                ? material.arrival_photos[0] 
                : '';
            
            row.innerHTML = `
                <td>
                    ${firstPhoto ? 
                        `<img src="${firstPhoto}" class="material-img" alt="${material.name}" 
                              onclick="openImageViewer(${JSON.stringify(material.arrival_photos).replace(/"/g, '&quot;')}, 0)">` : 
                        'No Photo'
                    }
                </td>
                <td>${material.name}</td>
                <td>${material.department}</td>
                <td>${material.quantity}</td>
                <td class="${material.status === 'available' ? 'status-available' : 'status-taken'}">${material.status}</td>
                <td>
                    ${material.status === 'available' ? 
                        `<button class="btn btn-success" onclick="openPickupModal(${material.id})">Pickup</button>` : 
                        'Already Taken'
                    }
                </td>
            `;
            
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading materials table:', error);
        alert('Error loading materials. Please try again.');
    }
}

async function loadMaterialsForHistory() {
    try {
        const materials = await getAllMaterials();
        const select = document.getElementById('historyMaterialSelect');
        
        while (select.children.length > 1) {
            select.removeChild(select.lastChild);
        }
        
        materials.forEach(material => {
            const option = document.createElement('option');
            option.value = material.id;
            option.textContent = material.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading materials for history:', error);
        alert('Error loading materials. Please try again.');
    }
}

async function loadMaterialHistory(materialId) {
    try {
        const history = await getMaterialHistory(materialId);
        const historyList = document.getElementById('historyList');
        const emptyState = document.getElementById('emptyHistory');
        
        historyList.innerHTML = '';
        
        if (history.length === 0) {
            emptyState.style.display = 'block';
            return;
        }
        
        emptyState.style.display = 'none';
        
        history.forEach(record => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            
            historyItem.innerHTML = `
                <div class="history-header">
                    <span class="history-date">${formatDate(record.date)}</span>
                    <span class="history-type ${record.type}">${record.type.toUpperCase()}</span>
                </div>
                <div>
                    <p><strong>By:</strong> ${record.by}</p>
                    ${record.notes ? `<p><strong>Notes:</strong> ${record.notes}</p>` : ''}
                </div>
                ${record.photos && record.photos.length > 0 ? `
                    <div class="history-photos">
                        ${record.photos.map((photo, index) => 
                            `<img src="${photo}" class="history-photo" alt="History photo" 
                                  onclick="openImageViewer(${JSON.stringify(record.photos).replace(/"/g, '&quot;')}, ${index})">`
                        ).join('')}
                    </div>
                ` : ''}
            `;
            
            historyList.appendChild(historyItem);
        });
    } catch (error) {
        console.error('Error loading material history:', error);
        alert('Error loading material history. Please try again.');
    }
}

function openPickupModal(materialId) {
    const modal = document.getElementById('pickupModal');
    const modalContent = modal.querySelector('div');
    
    document.getElementById('pickupMaterialId').value = materialId;
    modal.style.display = 'block';
    
    if (modalContent) {
        modalContent.scrollTop = 0;
    }
    
    document.body.style.overflow = 'hidden';
    
    pickupPhotosData = [];
    document.getElementById('pickupPhotosContainer').innerHTML = '';
    
    stopPickupCamera();
}

function closePickupModal() {
    const modal = document.getElementById('pickupModal');
    modal.style.display = 'none';
    document.getElementById('pickupForm').reset();
    
    document.body.style.overflow = '';
    
    stopPickupCamera();
    
    document.getElementById('pickupSubmitBtn').disabled = false;
    document.getElementById('pickupSubmitBtn').textContent = 'Confirmar Retiro';
}

function initMobileEnhancements() {
    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
        const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent);
        const rows = table.querySelectorAll('tbody tr');
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            cells.forEach((cell, index) => {
                cell.setAttribute('data-label', headers[index]);
            });
        });
    });

    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        let touchStart = null;
        
        modal.addEventListener('touchstart', (e) => {
            touchStart = e.touches[0].clientY;
        }, false);

        modal.addEventListener('touchmove', (e) => {
            if (!touchStart) return;
            
            const touchEnd = e.touches[0].clientY;
            const diff = touchStart - touchEnd;

            if (Math.abs(diff) > 50) {
                if (modal.id === 'imageViewerModal') {
                    closeImageViewer();
                } else if (modal.id === 'pickupModal') {
                    closePickupModal();
                }
                touchStart = null;
            }
        }, false);
    });

    const pickupModal = document.getElementById('pickupModal');
    const modalContent = pickupModal.querySelector('div');
    
    modalContent.addEventListener('touchmove', (e) => {
        e.stopPropagation();
    }, { passive: true });

    pickupModal.addEventListener('click', (e) => {
        if (e.target === pickupModal) {
            closePickupModal();
        }
    });

    pickupModal.removeEventListener('touchmove', null);
    
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
        modalContent.style.webkitOverflowScrolling = 'touch';
    }

    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            if (document.getElementById('materials').classList.contains('active')) {
                loadMaterialsTable();
            }
        }, 200);
    });
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('Application initialized successfully');
        
        // Setup realtime subscriptions
        setupRealtimeSubscriptions();
        
        // Navigation
        document.querySelector('nav').addEventListener('click', (e) => {
            if (e.target.classList.contains('nav-btn')) {
                const sectionId = e.target.getAttribute('data-section');
                if (sectionId) {
                    showSection(sectionId);
                }
            }
        });
        
        // Material form submission
        document.getElementById('materialForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (isProcessing) {
                console.log('Form submission already in progress, ignoring duplicate click');
                return;
            }
            
            isProcessing = true;
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Registrando...';
            
            showProcessingOverlay();
            
            const materialName = document.getElementById('materialName').value;
            const materialDepartment = document.getElementById('materialDepartment').value;
            const materialQuantity = parseInt(document.getElementById('materialQuantity').value);
            const uploadedBy = document.getElementById('uploadedBy').value;
            
            if (arrivalPhotosData.length === 0) {
                alert('Por favor capture al menos una foto de llegada');
                
                isProcessing = false;
                submitBtn.disabled = false;
                submitBtn.textContent = 'Registrar Material';
                hideProcessingOverlay();
                return;
            }
            
            try {
                const material = {
                    name: materialName,
                    department: materialDepartment,
                    quantity: materialQuantity,
                    status: 'available',
                    arrival_photos: arrivalPhotosData,
                    date_added: new Date().toISOString()
                };
                
                const materialId = await addMaterial(material);
                
                await addHistoryRecord({
                    material_id: materialId,
                    type: 'arrival',
                    date: new Date().toISOString(),
                    by: uploadedBy,
                    photos: arrivalPhotosData,
                    notes: `Material ${materialName} arrived for ${materialDepartment} department`
                });
                
                alert('Material registrado exitosamente!');
                document.getElementById('materialForm').reset();
                
                arrivalPhotosData = [];
                document.getElementById('arrivalPhotosContainer').innerHTML = '';
                
                stopArrivalCamera();
                
            } catch (error) {
                console.error('Error registering material:', error);
                alert('Error registering material. Please try again.');
            } finally {
                isProcessing = false;
                submitBtn.disabled = false;
                submitBtn.textContent = 'Registrar Material';
                hideProcessingOverlay();
            }
        });
        
        // Arrival camera controls
        document.getElementById('startArrivalCamera').addEventListener('click', startArrivalCamera);
        document.getElementById('captureArrivalPhoto').addEventListener('click', captureArrivalPhoto);
        document.getElementById('stopArrivalCamera').addEventListener('click', stopArrivalCamera);
        
        // Pickup camera controls
        document.getElementById('startPickupCamera').addEventListener('click', startPickupCamera);
        document.getElementById('capturePickupPhoto').addEventListener('click', capturePickupPhoto);
        document.getElementById('stopPickupCamera').addEventListener('click', stopPickupCamera);
        
        // Pickup form submission
        document.getElementById('pickupForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (isProcessing) {
                console.log('Pickup form submission already in progress, ignoring duplicate click');
                return;
            }
            
            isProcessing = true;
            const pickupSubmitBtn = document.getElementById('pickupSubmitBtn');
            pickupSubmitBtn.disabled = true;
            pickupSubmitBtn.textContent = 'Procesando...';
            
            const materialId = parseInt(document.getElementById('pickupMaterialId').value);
            const pickedUpBy = document.getElementById('pickedUpBy').value;
            
            if (pickupPhotosData.length === 0) {
                alert('Por favor capture al menos una foto de retiro');
                
                isProcessing = false;
                pickupSubmitBtn.disabled = false;
                pickupSubmitBtn.textContent = 'Confirmar Retiro';
                return;
            }
            
            try {
                await updateMaterial(materialId, { status: 'taken' });
                
                await addHistoryRecord({
                    material_id: materialId,
                    type: 'pickup',
                    date: new Date().toISOString(),
                    by: pickedUpBy,
                    photos: pickupPhotosData,
                    notes: `Material picked up by ${pickedUpBy}`
                });
                
                alert('Material retirado exitosamente!');
                closePickupModal();
                
            } catch (error) {
                console.error('Error recording pickup:', error);
                alert('Error recording pickup. Please try again.');
            } finally {
                isProcessing = false;
            }
        });
        
        // Cancel pickup
        document.getElementById('cancelPickup').addEventListener('click', closePickupModal);
        
        // History material selection
        document.getElementById('historyMaterialSelect').addEventListener('change', function() {
            const materialId = parseInt(this.value);
            if (materialId) {
                loadMaterialHistory(materialId);
            } else {
                document.getElementById('emptyHistory').style.display = 'block';
                document.getElementById('historyList').innerHTML = '';
            }
        });
        
        // Image viewer controls
        document.getElementById('imageViewerClose').addEventListener('click', closeImageViewer);
        document.getElementById('prevImage').addEventListener('click', prevImage);
        document.getElementById('nextImage').addEventListener('click', nextImage);
        
        // Close modal when clicking outside
        document.getElementById('imageViewerModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeImageViewer();
            }
        });
        
        // Close pickup modal when clicking outside
        document.getElementById('pickupModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closePickupModal();
            }
        });
        
        // Add reload button listener (kept for compatibility)
        document.getElementById('reloadMaterials').addEventListener('click', async () => {
            try {
                await loadMaterialsTable();
                alert('Lista de materiales actualizada exitosamente!');
            } catch (error) {
                console.error('Error reloading materials:', error);
                alert('Error al actualizar la lista de materiales. Por favor intente de nuevo.');
            }
        });
        
        // Initialize mobile enhancements
        initMobileEnhancements();
        
        // Initial load
        loadMaterialsTable();
        loadMaterialsForHistory();
        
    } catch (error) {
        console.error('Error iniciando la aplicación:', error);
        alert('Error al iniciar la aplicación. Por favor recargue la página.');
    }
});

// Cleanup subscriptions when page is unloaded
window.addEventListener('beforeunload', () => {
    cleanupRealtimeSubscriptions();
});