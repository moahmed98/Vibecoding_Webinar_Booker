document.addEventListener('DOMContentLoaded', () => {
    const checkBtn = document.getElementById('check-availability-btn');
    const bookingForm = document.getElementById('bookingForm');
    const feedbackDiv = document.getElementById('availability-feedback');
    const extendedForm = document.getElementById('extended-form');
    const typeSelect = document.getElementById('type');
    const bootcampField = document.getElementById('bootcamp-field');
    const bootcampSelect = document.getElementById('bootcampName');
    const specificEventField = document.getElementById('specific-event-field');
    const specificEventSelect = document.getElementById('specificEventType');
    const customEventField = document.getElementById('custom-event-field');
    const customEventInput = document.getElementById('customEventName');
    const submitBtn = document.getElementById('submit-btn');
    const finalMessage = document.getElementById('final-message');

    // Date/time inputs
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const startTimeInput = document.getElementById('start-time');
    const endTimeInput = document.getElementById('end-time');

    // Success card elements
    const bookingCard = document.getElementById('booking-card');
    const successCard = document.getElementById('success-card');
    const processStreetBtn = document.getElementById('process-street-btn');
    const retryPsBtn = document.getElementById('retry-ps-btn');

    let availabilityChecked = false;
    let bookedEventData = null;

    // Combine separate date + time inputs into ISO string
    function combineDateTime(dateVal, timeVal) {
        if (!dateVal || !timeVal) return null;
        return `${dateVal}T${timeVal}`;
    }

    // Auto-sync end date when start date is picked
    startDateInput.addEventListener('change', () => {
        if (!endDateInput.value) {
            endDateInput.value = startDateInput.value;
        }
    });

    // Check availability
    checkBtn.addEventListener('click', async () => {
        const start = combineDateTime(startDateInput.value, startTimeInput.value);
        const end = combineDateTime(endDateInput.value, endTimeInput.value);

        if (!start || !end) {
            alert('Please fill in all date and time fields.');
            return;
        }

        if (new Date(start) >= new Date(end)) {
            alert('End date/time must be after start date/time.');
            return;
        }

        // Block Thursdays after 6 PM (check both start and end)
        const startDt = new Date(start);
        const endDt = new Date(end);
        const startHour = parseInt(startTimeInput.value.split(':')[0], 10);
        const endHour = parseInt(endTimeInput.value.split(':')[0], 10);
        const isThursdayBlocked =
            (startDt.getDay() === 4 && startHour >= 18) ||
            (endDt.getDay() === 4 && endHour > 18) ||
            (endDt.getDay() === 4 && endHour === 18 && parseInt(endTimeInput.value.split(':')[1], 10) > 0);

        if (isThursdayBlocked) {
            feedbackDiv.classList.remove('hidden');
            feedbackDiv.innerHTML = '<span style="color: #FD7E15;">❌ Thursdays after 6:00 PM are not available.</span>';
            feedbackDiv.style.background = 'rgba(253, 126, 21, 0.08)';
            extendedForm.classList.add('hidden');
            availabilityChecked = false;
            checkBtn.disabled = false;
            return;
        }

        feedbackDiv.classList.remove('hidden');
        feedbackDiv.innerHTML = '<span style="color: rgba(255,255,255,0.5);">Checking...</span>';
        feedbackDiv.style.background = 'rgba(255,255,255,0.04)';
        checkBtn.disabled = true;

        try {
            const response = await fetch('/api/check-availability', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ start, end })
            });
            const data = await response.json();

            if (data.available) {
                feedbackDiv.innerHTML = '<span style="color: #20C997;">✅ Slot Available</span>';
                feedbackDiv.style.background = 'rgba(32, 201, 151, 0.08)';
                extendedForm.classList.remove('hidden');
                checkBtn.classList.add('hidden');
                availabilityChecked = true;
            } else {
                feedbackDiv.innerHTML = '<span style="color: #FD7E15;">❌ Slot Busy. Choose another time.</span>';
                feedbackDiv.style.background = 'rgba(253, 126, 21, 0.08)';
                extendedForm.classList.add('hidden');
                availabilityChecked = false;
                checkBtn.disabled = false;
            }
        } catch (error) {
            console.error(error);
            feedbackDiv.innerHTML = '<span style="color: #FD7E15;">Error checking availability.</span>';
            feedbackDiv.style.background = 'rgba(253, 126, 21, 0.08)';
            checkBtn.disabled = false;
        }
    });

    // Reset availability on any date/time change
    const resetAvailability = () => {
        if (availabilityChecked) {
            extendedForm.classList.add('hidden');
            checkBtn.classList.remove('hidden');
            checkBtn.disabled = false;
            feedbackDiv.classList.add('hidden');
            availabilityChecked = false;
            finalMessage.textContent = '';
        }
    };
    startDateInput.addEventListener('change', resetAvailability);
    endDateInput.addEventListener('change', resetAvailability);
    startTimeInput.addEventListener('change', resetAvailability);
    endTimeInput.addEventListener('change', resetAvailability);

    // Toggle fields based on Webinar Type
    typeSelect.addEventListener('change', (e) => {
        const selectedType = e.target.value;

        if (selectedType === 'Bootcamp Webinar') {
            // Show bootcamp name, HIDE specific event type
            bootcampField.classList.remove('hidden');
            bootcampSelect.required = true;
            specificEventField.classList.add('hidden');
            specificEventSelect.value = '';
            customEventField.classList.add('hidden');
            customEventInput.value = '';
            customEventInput.required = false;
        } else if (selectedType === 'Course Webinar') {
            // Hide bootcamp, SHOW specific event type
            bootcampField.classList.add('hidden');
            bootcampSelect.required = false;
            bootcampSelect.value = '';
            specificEventField.classList.remove('hidden');
        } else {
            // Default: hide both
            bootcampField.classList.add('hidden');
            bootcampSelect.required = false;
            bootcampSelect.value = '';
            specificEventField.classList.add('hidden');
            specificEventSelect.value = '';
            customEventField.classList.add('hidden');
            customEventInput.value = '';
            customEventInput.required = false;
        }
    });

    // Toggle Custom Event Name based on Specific Event Type
    specificEventSelect.addEventListener('change', (e) => {
        if (e.target.value === 'Other') {
            customEventField.classList.remove('hidden');
            customEventInput.required = true;
        } else {
            customEventField.classList.add('hidden');
            customEventInput.required = false;
            customEventInput.value = '';
        }
    });

    // Format date for display
    function formatDateTime(isoString) {
        const date = new Date(isoString);
        return date.toLocaleString('en-IN', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // Handle Submission
    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!availabilityChecked) return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'BOOKING...';
        finalMessage.textContent = '';

        const start = combineDateTime(startDateInput.value, startTimeInput.value);
        const end = combineDateTime(endDateInput.value, endTimeInput.value);

        let eventTypeName = specificEventSelect.value;
        if (eventTypeName === 'Other') {
            eventTypeName = customEventInput.value;
        }

        const formData = {
            title: document.getElementById('title').value,
            start: start,
            end: end,
            type: document.getElementById('type').value,
            bootcampName: bootcampSelect.value,
            specificEventType: eventTypeName,
            linkedin: document.getElementById('linkedin').value
        };

        try {
            const response = await fetch('/api/book-event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const result = await response.json();

            if (result.success) {
                bookedEventData = { ...formData, notionUrl: result.url };

                document.getElementById('summary-title').textContent = formData.title;
                document.getElementById('summary-start').textContent = formatDateTime(formData.start);
                document.getElementById('summary-end').textContent = formatDateTime(formData.end);
                document.getElementById('summary-type').textContent = formData.type;

                if (formData.bootcampName) {
                    document.getElementById('summary-bootcamp').textContent = formData.bootcampName;
                    document.getElementById('summary-bootcamp-row').classList.remove('hidden');
                }

                document.getElementById('summary-linkedin').textContent = formData.linkedin;
                document.getElementById('notion-link').href = result.url;

                bookingCard.classList.add('hidden');
                successCard.classList.remove('hidden');
            } else {
                finalMessage.innerHTML = `<span style="color: #FD7E15;">Error: ${result.error || 'Submission failed'}</span>`;
                submitBtn.disabled = false;
                submitBtn.textContent = 'CONFIRM BOOKING';
            }
        } catch (error) {
            console.error(error);
            finalMessage.innerHTML = '<span style="color: #FD7E15;">Network Error. Please try again.</span>';
            submitBtn.disabled = false;
            submitBtn.textContent = 'CONFIRM BOOKING';
        }
    });

    // Process Street Integration
    async function triggerProcessStreet() {
        const prompt = document.getElementById('process-street-prompt');
        const loading = document.getElementById('process-street-loading');
        const success = document.getElementById('process-street-success');
        const errorDiv = document.getElementById('process-street-error');

        prompt.classList.add('hidden');
        loading.classList.remove('hidden');
        errorDiv.classList.add('hidden');

        try {
            const response = await fetch('/api/trigger-process-street', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookedEventData)
            });
            const result = await response.json();

            console.log('Process Street Response:', result);

            loading.classList.add('hidden');

            if (result.success) {
                success.classList.remove('hidden');
            } else {
                errorDiv.classList.remove('hidden');
            }
        } catch (error) {
            console.error(error);
            loading.classList.add('hidden');
            errorDiv.classList.remove('hidden');
        }
    }

    processStreetBtn.addEventListener('click', triggerProcessStreet);
    retryPsBtn.addEventListener('click', () => {
        document.getElementById('process-street-error').classList.add('hidden');
        document.getElementById('process-street-prompt').classList.remove('hidden');
    });

    // Request Date Change
    document.getElementById('request-date-change-btn').addEventListener('click', function () {
        this.classList.add('hidden');
        document.getElementById('date-change-message').classList.remove('hidden');
    });
});
