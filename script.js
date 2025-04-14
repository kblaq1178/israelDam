document.addEventListener('DOMContentLoaded', () => {
    const parkingLotElement = document.getElementById('parking-lot');
    const messageArea = document.getElementById('message-area');
    const bookingControls = document.getElementById('booking-controls');
    const exitControls = document.getElementById('exit-controls');
    const selectedSlotBookingSpan = document.getElementById('selected-slot-booking');
    const selectedSlotExitingSpan = document.getElementById('selected-slot-exiting');
    const vehicleTypeSelect = document.getElementById('vehicle-type');
    const bookButton = document.getElementById('book-button');
    const cancelBookingButton = document.getElementById('cancel-booking-button');
    const exitVehicleTypeSpan = document.getElementById('exit-vehicle-type');
    const exitEntryTimeSpan = document.getElementById('exit-entry-time');
    const exitButton = document.getElementById('exit-button');
    const cancelExitButton = document.getElementById('cancel-exit-button');
    const chargeInfoDiv = document.getElementById('charge-info');
    const totalChargeSpan = document.getElementById('total-charge');
    const confirmExitButton = document.getElementById('confirm-exit-button');
    const totalCollectedSpan = document.getElementById('total-collected');

    // Ensure button group visibility is managed correctly along with charge info
    const exitButtonGroup = exitButton.parentElement;

    const NUM_SLOTS = 15;
    const NUM_SMALL_ONLY = 10;
    const SMALL_SLOT_FEE = 60; // Base fee
    const LARGE_SLOT_FEE = 100; // Base fee
    const BASE_TIME_LIMIT_MS = 30 * 60 * 1000; // 30 minutes
    const OVERTIME_FEE_PER_HOUR = 15;
    const HOUR_IN_MS = 60 * 60 * 1000;

    let parkingSlots = [];
    let selectedSlotId = null;
    let totalCollected = 0;

    function initializeParkingLot() {
        // Try load from localStorage
        const savedState = localStorage.getItem('parkingLotState');
        const savedTotal = localStorage.getItem('totalCollected');

        if (savedState) {
            try {
                parkingSlots = JSON.parse(savedState);
                // Ensure loaded data has the correct structure/properties
                if (!Array.isArray(parkingSlots) || parkingSlots.length !== NUM_SLOTS || !parkingSlots[0]?.id) {
                   throw new Error("Invalid saved state structure");
                }
            } catch (e) {
                console.error("Failed to load or parse saved state, initializing fresh.", e);
                localStorage.removeItem('parkingLotState'); // Clear invalid state
                initializeFreshState();
            }
        } else {
            // Initialize fresh state
            initializeFreshState();
        }

        if (savedTotal) {
            const parsedTotal = parseFloat(savedTotal);
            if (!isNaN(parsedTotal)) {
                 totalCollected = parsedTotal;
            } else {
                localStorage.removeItem('totalCollected'); // Clear invalid total
            }

        }

        renderParkingLot();
        updateDashboard();
    }

    function initializeFreshState() {
         parkingSlots = Array.from({ length: NUM_SLOTS }, (_, i) => ({
            id: i + 1,
            type: i < NUM_SMALL_ONLY ? 'small' : 'large', // First 10 are small only
            status: 'free', // 'free' or 'occupied'
            vehicleType: null, // 'small' or 'large'
            entryTime: null,
        }));
        totalCollected = 0;
    }

    function saveState() {
        try {
            localStorage.setItem('parkingLotState', JSON.stringify(parkingSlots));
            localStorage.setItem('totalCollected', totalCollected.toString());
        } catch (e) {
            console.error("Error saving state to localStorage:", e);
            // Optionally alert the user or handle the error
             messageArea.textContent = "Warning: Could not save parking state. Data might be lost on refresh.";
             messageArea.style.backgroundColor = 'var(--occupied-large-bg)'; // Warning color
        }
    }

    function renderParkingLot() {
        parkingLotElement.innerHTML = ''; // Clear existing slots
        parkingSlots.forEach(slot => {
            const slotDiv = document.createElement('div');
            slotDiv.classList.add('slot', slot.type, slot.status);
            if (slot.id === selectedSlotId) {
                slotDiv.classList.add('selected'); // Keep selection visual on re-render
            }
            slotDiv.dataset.id = slot.id;

            let content = `<span class="slot-id">#${slot.id}</span>`; // Simplified ID
            // Concise type description
            content += `<span class="slot-type">${slot.type === 'small' ? 'Small Only' : 'Any Vehicle'}</span>`;

            if (slot.status === 'occupied') {
                 slotDiv.classList.add(slot.vehicleType); // Add vehicle type class for styling occupied slots
                 content += `<span class="vehicle-info">${slot.vehicleType.charAt(0).toUpperCase() + slot.vehicleType.slice(1)}</span>`; // Capitalize
                 const entry = new Date(slot.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); // Simpler time format
                 content += `<span class="entry-time">In: ${entry}</span>`;
            }

            slotDiv.innerHTML = content;

            slotDiv.addEventListener('click', () => handleSlotClick(slot.id));
            parkingLotElement.appendChild(slotDiv);
        });
        // Clear selections and controls ONLY if the previously selected slot no longer exists
        // (This scenario shouldn't happen with current logic, but good practice)
        if (selectedSlotId && !parkingSlots.some(s => s.id === selectedSlotId)) {
             clearSelection();
        } else if (selectedSlotId && !parkingLotElement.querySelector('.slot.selected')) {
            // If the selected slot exists in data but not in DOM (edge case), clear selection
            clearSelection();
        }
    }

    function updateDashboard() {
        totalCollectedSpan.textContent = totalCollected.toFixed(2);
    }

    function handleSlotClick(slotId) {
        const slot = parkingSlots.find(s => s.id === slotId);
        if (!slot) return;

        // If charge info is showing for this slot, don't deselect
        if (slotId === selectedSlotId && !chargeInfoDiv.classList.contains('hidden')) {
             return;
        }

        // Deselect if clicking the same slot again
        if (slotId === selectedSlotId) {
            clearSelection();
            return;
        }

        clearSelection(false); // Clear previous selection state but keep message
        selectedSlotId = slotId;

        // Visually mark selected slot
        const slotElement = parkingLotElement.querySelector(`.slot[data-id="${slotId}"]`);
        if (slotElement) {
            slotElement.classList.add('selected');
        }

        if (slot.status === 'free') {
            messageArea.textContent = `Selected free Slot ${slotId}. Choose vehicle type to book.`;
            selectedSlotBookingSpan.textContent = `#${slotId}`;
            vehicleTypeSelect.value = 'small'; // Default to small
            // Disable large vehicle option for small slots
            vehicleTypeSelect.querySelector('option[value="large"]').disabled = (slot.type === 'small');
            bookingControls.classList.remove('hidden');
            exitControls.classList.add('hidden');
            chargeInfoDiv.classList.add('hidden');
            // Ensure exit buttons are visible again if they were hidden
            exitButtonGroup.classList.remove('hidden');
        } else { // Occupied
            messageArea.textContent = `Selected occupied Slot ${slotId}. Calculate fee to proceed with exit.`;
            selectedSlotExitingSpan.textContent = `#${slotId}`;
            exitVehicleTypeSpan.textContent = slot.vehicleType.charAt(0).toUpperCase() + slot.vehicleType.slice(1);
            exitEntryTimeSpan.textContent = new Date(slot.entryTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short'}); // Locale-friendly format
            bookingControls.classList.add('hidden');
            exitControls.classList.remove('hidden');
            chargeInfoDiv.classList.add('hidden'); // Hide charge initially
            exitButtonGroup.classList.remove('hidden'); // Show calculate/cancel buttons
        }
        // Reset message style
        messageArea.style.backgroundColor = ''; // Reset background
        messageArea.style.color = ''; // Reset text color
    }

    function clearSelection(resetMessage = true) {
         if (selectedSlotId) {
            const previousSelected = parkingLotElement.querySelector(`.slot[data-id="${selectedSlotId}"]`);
            if (previousSelected) {
                previousSelected.classList.remove('selected');
            }
        }
        selectedSlotId = null;
        bookingControls.classList.add('hidden');
        exitControls.classList.add('hidden');
        chargeInfoDiv.classList.add('hidden');
        // Show the default exit button group when clearing
        exitButtonGroup.classList.remove('hidden');

        if (resetMessage) {
            messageArea.textContent = 'Select a free slot to book or an occupied slot to manage exit.';
            messageArea.style.backgroundColor = ''; // Reset background
            messageArea.style.color = ''; // Reset text color
        }
    }

    bookButton.addEventListener('click', () => {
        if (!selectedSlotId) return;

        const slot = parkingSlots.find(s => s.id === selectedSlotId);
        const selectedVehicleType = vehicleTypeSelect.value;

        if (slot && slot.status === 'free') {
            // Double check compatibility (though UI should prevent this)
            if (slot.type === 'small' && selectedVehicleType === 'large') {
                messageArea.textContent = 'Error: Large vehicles cannot park in small-only slots.';
                messageArea.style.backgroundColor = 'var(--occupied-small-bg)'; // Error color
                messageArea.style.color = 'var(--danger-color)';
                return;
            }

            slot.status = 'occupied';
            slot.vehicleType = selectedVehicleType;
            slot.entryTime = Date.now();

            messageArea.textContent = `Success: Slot ${slot.id} booked for a ${selectedVehicleType} vehicle.`;
            messageArea.style.backgroundColor = 'var(--free-large-bg)';
            messageArea.style.color = 'var(--success-color)';
            saveState();
            renderParkingLot(); // Re-render to show occupied status
            clearSelection();
        }
    });

    cancelBookingButton.addEventListener('click', () => clearSelection());
    cancelExitButton.addEventListener('click', () => clearSelection());

    exitButton.addEventListener('click', () => {
         if (!selectedSlotId) return;
         const slot = parkingSlots.find(s => s.id === selectedSlotId);

         if (slot && slot.status === 'occupied') {
             const charge = calculateCharge(slot);
             totalChargeSpan.textContent = charge.toFixed(2);
             chargeInfoDiv.classList.remove('hidden');
             exitButton.classList.add('hidden'); // Hide initial exit btn
             cancelExitButton.classList.add('hidden'); // Hide cancel btn
             messageArea.textContent = `Calculated charge for Slot ${slot.id}. Confirm exit to free the slot.`;
         }
    });

    confirmExitButton.addEventListener('click', () => {
        if (!selectedSlotId) return;
        const slotIndex = parkingSlots.findIndex(s => s.id === selectedSlotId);

        if (slotIndex !== -1 && parkingSlots[slotIndex].status === 'occupied') {
            const charge = calculateCharge(parkingSlots[slotIndex]);

            // Update total collected
            totalCollected += charge;

            // Free up the slot
            parkingSlots[slotIndex].status = 'free';
            parkingSlots[slotIndex].vehicleType = null;
            parkingSlots[slotIndex].entryTime = null;

            messageArea.textContent = `Success: Slot ${selectedSlotId} is now free. Charged ${charge.toFixed(2)} USD.`;
            messageArea.style.backgroundColor = 'var(--free-large-bg)';
            messageArea.style.color = 'var(--success-color)';
            saveState();
            updateDashboard();
            renderParkingLot();
            clearSelection(); // Resets UI state including hiding controls
        }
    });

    function calculateCharge(slot) {
        const durationMs = Date.now() - slot.entryTime;
        let totalCharge = slot.type === 'small' ? SMALL_SLOT_FEE : LARGE_SLOT_FEE;

        if (durationMs > BASE_TIME_LIMIT_MS) {
            const overtimeMs = durationMs - BASE_TIME_LIMIT_MS;
            // Calculate extra hours, rounding up
            const extraHours = Math.ceil(overtimeMs / HOUR_IN_MS);
            totalCharge += extraHours * OVERTIME_FEE_PER_HOUR;
        }

        return totalCharge;
    }

    initializeParkingLot();
});