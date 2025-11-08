// Global Variables
let isVoiceEnabled = false;
let isListening = false;
let speechRecognition = null;
let speechSynthesis = window.speechSynthesis;
let currentLanguage = 'en-US';

// Cache DOM elements
const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const voiceInputButton = document.getElementById('voiceInputButton');
const toggleVoiceButton = document.getElementById('toggleVoice');
const languageSelect = document.getElementById('languageSelect');
const typingIndicator = document.getElementById('typingIndicator');

// Store campus data
// Store campus data
let campusData = null;

// Import our utility classes
const DataManager = {
    async loadDepartmentData() {
        try {
            const response = await fetch('./data/departments.json');
            return await response.json();
        } catch (error) {
            console.error('Error loading department data:', error);
            return null;
        }
    },

    async getDepartmentInfo(deptCode) {
        const data = await this.loadDepartmentData();
        return data?.departments?.[deptCode.toLowerCase()];
    },

    async getHODInfo(deptCode) {
        const dept = await this.getDepartmentInfo(deptCode);
        return dept?.hod;
    },

    // Return an array of department objects [{code, name, ...}]
    async getDepartmentsList() {
        const data = await this.loadDepartmentData();
        const deps = data?.departments || {};
        return Object.keys(deps).map(code => ({ code, ...deps[code] }));
    },

    formatResponse(info, query) {
        if (!info) {
            return 'I apologize, but I don\'t have that information.';
        }

        // HOD specific responses
        if (query.toLowerCase().includes('hod')) {
            const hod = info.hod;
            return `
                The Head of Department (HOD) for ${info.name} is ${hod.name}.
                
                Contact Information:
                - Email: ${hod.email}
                - Phone: ${hod.phone}
                - Office: ${hod.office}
                - Office Hours: ${hod.office_hours}

                Qualifications:
                ${hod.qualifications.join(', ')}

                Specializations:
                ${hod.specializations.join(', ')}

                Experience:
                ${hod.experience}
            `.replace(/^\s+/gm, '');
        }

        // General department information
        return `
            Department: ${info.name}
            Location: ${info.location}
            
            Programs Offered:
            ${info.programs.join(', ')}
            
            Contact Information:
            - Email: ${info.contact.email}
            - Phone: ${info.contact.phone}
            - Fax: ${info.contact.fax}
        `.replace(/^\s+/gm, '');
    }
};

const QueryHandler = {
    async handleDepartmentQuery(query) {
        try {
            const deptMatch = query.match(/\b(cse|ece|eee|mech|civil)\b/i);
            if (!deptMatch) {
                return "I couldn't identify which department you're asking about. Please mention the department code (e.g., CSE, ECE, etc.)";
            }

            const deptCode = deptMatch[1];
            const deptInfo = await DataManager.getDepartmentInfo(deptCode);

            if (!deptInfo) {
                return `I don't have information about the ${deptCode.toUpperCase()} department.`;
            }

            return DataManager.formatResponse(deptInfo, query);
        } catch (error) {
            console.error('Error handling department query:', error);
            return "I'm sorry, but I encountered an error while processing your query. Please try again.";
        }
    },

    async processChatMessage(message) {
        const lowerMsg = message.toLowerCase();
        
        // Department related queries
        if (lowerMsg.includes('hod') || lowerMsg.includes('head of department') ||
            lowerMsg.includes('department') || /\b(cse|ece|eee|mech|civil)\b/i.test(lowerMsg)) {
            return this.handleDepartmentQuery(message);
        }

        return null; // Return null if query is not department related
    }
};

// Keywords and their corresponding data paths
const keywords = {
    'library': ['facilities', 'library'],
    'hostel': ['facilities', 'hostel'],
    'canteen': ['facilities', 'canteen'],
    'wifi': ['facilities', 'wifi'],
    'department': ['departments'],
    'hod': ['departments'],
    'event': ['events'],
    'placement': ['placements'],
    'recruiter': ['placements', 'topRecruiters'],
    'exam': ['examSchedules']
};

// Handle faculty related queries
function handleFacultyQuery(query) {
    const q = query.toLowerCase();
    
    // Principal/Director queries
    if (/(principal|director)/i.test(q)) {
        if (q.includes('principal')) {
            const principal = campusData.college.keyPersonnel.principal;
            return `The Principal is ${principal.name} (${principal.qualifications.join(', ')}).`;
        }
        if (q.includes('director')) {
            const director = campusData.college.keyPersonnel.director;
            return `The Director is ${director.name}. Teaching interests include ${director.interests.join(', ')}.`;
        }
    }

    // HOD queries
    if (/(hod|head.*department)/i.test(q)) {
        if (q.includes('cse') || q.includes('computer')) {
            const cse = campusData.departments.find(d => d.name.toLowerCase().includes('computer'));
            return `The HOD of CSE is ${cse.hod.name}, ${cse.hod.designation}.`;
        }
    }

    return null;
}

// Handle schedule related queries
function handleScheduleQuery(query) {
    const q = query.toLowerCase();
    
    // Working hours
    if (/(working hours|college timing|time|when.*open)/i.test(q)) {
        return `College working hours are ${campusData.academicSchedules.workingHours}, ${campusData.academicSchedules.workingDays}. ${campusData.academicSchedules.holidays} closed.`;
    }

    // Exam schedules
    if (/(exam|examination)/i.test(q)) {
        const recentExams = campusData.academicSchedules.timetables.exam_branch.recent_notices;
        return `Recent exam schedules:\n${recentExams.join('\n')}`;
    }

    // Transport
    if (/(transport|bus|route)/i.test(q)) {
        return `College provides transport service with buses arriving at campus by ${campusData.transport.arrivalTime}. Multiple routes are available including via Secunderabad and ECIL. Contact Transport Section Office for specific route details.`;
    }

    // Attendance rules
    if (/(attendance|rules|leave)/i.test(q)) {
        return `Attendance Rules:\n${campusData.academicSchedules.attendanceRules.join('\n')}`;
    }

    return null;
}

// Handle common college-level queries
async function handleCollegeQuery(query) {
    const q = query.toLowerCase();

    // Ensure campusData is loaded
    if (!campusData) {
        try {
            await loadCampusData();
        } catch (e) {
            console.error('Failed loading campusData for college query', e);
            return null;
        }
    }

    // Check for faculty related queries
    const facultyResponse = handleFacultyQuery(query);
    if (facultyResponse) return facultyResponse;

    // Check for schedule related queries
    const scheduleResponse = handleScheduleQuery(query);
    if (scheduleResponse) return scheduleResponse;

    // Load departments list
    let departments = [];
    try {
        departments = await DataManager.getDepartmentsList();
    } catch (e) {
        console.error('Failed loading departments for college query', e);
    }

    const branchNames = departments.map(d => d.name);

    // College establishment and type queries
    if (/(when|which year|established|started)/i.test(q)) {
        return `${campusData.college.name} was established in ${campusData.college.establishedYear}. It is a ${campusData.college.type} ${campusData.college.affiliation ? 'affiliated to ' + campusData.college.affiliation : ''}.`;
    }

    // Accreditation queries
    if (/(accreditation|naac|grade)/i.test(q)) {
        return `The college holds ${campusData.college.accreditation} accreditation.`;
    }

    // Contact information queries
    if (/(contact|phone|email|reach|office hours)/i.test(q)) {
        return `Contact Information:
            Principal's Office: ${campusData.config.emergencyContacts.principalOffice}
            Email: ${campusData.college.contact?.email || 'info@gcet.edu.in'}
            Office Hours: ${campusData.college.contact?.officeTiming || '9:00 AM – 3:40 PM (Sunday closed)'}
            Website: ${campusData.college.website}`.replace(/^\s+/gm, '');
    }

    // Campus facilities queries
    if (/(facilities|infrastructure|campus|amenities)/i.test(q)) {
        const facilities = campusData.facilities.infrastructure.facilities;
        return `Our ${campusData.facilities.infrastructure.campusArea} campus features:
            ${facilities.join(', ')}
            
            We also provide:
            - Transport: ${campusData.facilities.transport.available ? 'Available' : 'Not available'}
            - Hostel: ${campusData.facilities.hostel.available ? 'Available for both boys and girls' : 'Not available'}
            - WiFi: ${campusData.facilities.wifi.coverage} coverage`.replace(/^\s+/gm, '');
    }

    // Admission queries
    if (/(admission|how to apply|entrance|eligibility)/i.test(q)) {
        return `Admissions are primarily through state-level entrance exams (e.g., TS EAMCET).
            Eligibility:
            - For UG: 10+2
            - For PG: Graduation + entrance exams
            
            B.Tech first year fee range: ₹1.05 Lakh – ₹1.2 Lakhs (varies by course & year)`.replace(/^\s+/gm, '');
    }

    // Placement queries
    if (/(placement|package|job|recruitment|salary)/i.test(q)) {
        const stats = campusData.placements.statistics;
        return `Placement Highlights:
            - ${stats.companiesVisited} companies visited
            - ${stats.studentsPlaced} students placed
            - Highest package: ${stats.highestPackage}
            - Average package: ${stats.averagePackage}
            
            Top recruiters include: ${campusData.placements.topRecruiters.slice(0, 5).join(', ')} and more.`.replace(/^\s+/gm, '');
    }

    // How many branches / departments
    if (/(how many|number of|how many branches|how many departments|count of departments)/i.test(q) || q.includes('branches')) {
        const count = branchNames.length;
        return `We offer ${count} branches: ${branchNames.join(', ')}.`;
    }

    // List branches
    if (/(which branches|list branches|what branches|available branches|departments do you have)/i.test(q) || q.includes('list of branches')) {
        return `Our branches are: ${branchNames.join(', ')}.`;
    }

    // Does it have pharmacy / is pharmacy available
    if (q.includes('pharmacy') || q.includes('pharm')) {
        const hasPharmacy = departments.some(d => d.code === 'pharmacy' || /pharm/i.test(d.name));
        return hasPharmacy ? 'Yes — the college has a Pharmacy department.' : 'No, there is no Pharmacy department listed.';
    }

    // College name
    if (/(what is the name|college name|your college name|who are you)/i.test(q) || q.includes('college name')) {
        const name = campusData?.college?.name || 'Our college';
        return `This is ${name}.`;
    }

    // College location
    if (/(where|location|address|place|located)/i.test(q)) {
        const loc = campusData?.college?.location;
        if (loc) {
            // If asking specifically about address
            if (/address/i.test(q)) {
                return `The complete address is: ${loc.village}, ${loc.mandal}, ${loc.district}, ${loc.state}, ${loc.country} - ${loc.pinCode}`;
            }
            // If asking about which village/area
            if (/(village|area|mandal)/i.test(q)) {
                return `The college is situated in ${loc.village}, ${loc.mandal}`;
            }
            // If asking which district/state
            if (/(district|state)/i.test(q)) {
                return `The college is in ${loc.district}, ${loc.state}`;
            }
            // If asking for directions or where
            if (/(where|how to reach|direction)/i.test(q)) {
                return `The college is located in ${loc.village}, ${loc.mandal}. It's in ${loc.district}, ${loc.state}. You can reach us at PIN: ${loc.pinCode}`;
            }
            // Default location response
            return `We are located in ${loc.village}, ${loc.mandal}, ${loc.district}`;
        }
        return "I'm sorry — I don't have the college location on file.";
    }

    return null; // not a college-level question
}

// General conversation patterns
const conversationPatterns = {
    greetings: {
        patterns: ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'greetings'],
        responses: [
            "Hello! How can I help you today?",
            "Hi there! What would you like to know about our campus?",
            "Hello! I'm here to assist you with campus-related information.",
            "Hi! Feel free to ask me anything about our college."
        ]
    },
    farewell: {
        patterns: ['bye', 'goodbye', 'see you', 'thanks', 'thank you'],
        responses: [
            "Goodbye! Feel free to come back if you have more questions!",
            "Thank you for chatting! Have a great day!",
            "You're welcome! Don't hesitate to ask if you need anything else.",
            "Bye! I'm here 24/7 if you need more information!"
        ]
    },
    help: {
        patterns: ['help', 'what can you do', 'how do you work', 'what do you do'],
        responses: [
            "I can help you with information about:\n- Campus facilities (library, hostel, canteen, WiFi)\n- Departments and faculty\n- Events and clubs\n- Placement information\n- Exam schedules\nJust ask me anything!",
            "I'm your campus guide! You can ask me about facilities, departments, events, placements, or exam schedules. How can I assist you?"
        ]
    }
};

// --- Lightweight NLP utilities ---
function normalizeText(text) {
    return text.trim().toLowerCase().replace(/[.,!?;:()"']/g, '');
}

function tokenize(text) {
    return normalizeText(text).split(/\s+/).filter(Boolean);
}

function similarityScore(a, b) {
    // simple token overlap score
    const ta = new Set(tokenize(a));
    const tb = new Set(tokenize(b));
    let matches = 0;
    ta.forEach(t => { if (tb.has(t)) matches++; });
    return matches / Math.max(1, Math.max(ta.size, tb.size));
}

async function matchDepartmentFromText(text) {
    const deps = await DataManager.getDepartmentsList();
    const t = normalizeText(text);
    // check codes
    for (const d of deps) {
        if (t.includes(d.code)) return d.code;
    }
    // check name similarity
    let best = { code: null, score: 0 };
    for (const d of deps) {
        const score = similarityScore(d.name, text);
        if (score > best.score) best = { code: d.code, score };
    }
    // threshold
    return best.score >= 0.25 ? best.code : null;
}

async function nlpAnalyze(query) {
    const q = normalizeText(query);
    const tokens = tokenize(q);

    // greetings/farewell/help
    const greetWords = ['hi','hello','hey','greetings'];
    if (tokens.some(t => greetWords.includes(t))) return { intent: 'greeting' };
    const byeWords = ['bye','goodbye','see you','thanks','thank you'];
    if (tokens.some(t => byeWords.includes(t))) return { intent: 'farewell' };
    if (q.includes('help') || q.includes('what can you do')) return { intent: 'help' };

    // College information queries
    if (/(college|institution|university)/i.test(q) || /(where|location|address|place)/i.test(q)) {
        if (/(when|year|establish|start)/i.test(q)) return { intent: 'college_establishment' };
        if (/(accredit|naac|grade)/i.test(q)) return { intent: 'college_accreditation' };
        if (/(contact|phone|email|reach|office)/i.test(q)) return { intent: 'college_contact' };
        if (/(facility|infrastructure|campus|amenity)/i.test(q)) return { intent: 'college_facilities' };
        if (/(admission|apply|entrance|eligibility|fee)/i.test(q)) return { intent: 'college_admission' };
        if (/(placement|package|job|recruitment|salary)/i.test(q)) return { intent: 'college_placement' };
        if (/(where|location|address|place|located)/i.test(q)) return { intent: 'college_location' };
    }

    // Faculty and staff queries
    if (/(principal|director|hod|faculty|professor|dean)/i.test(q)) {
        return { intent: 'faculty_query', entities: { role: q.match(/(principal|director|hod|dean)/i)?.[1] } };
    }

    // Schedule and timing queries
    if (/(schedule|timing|hour|working hour|time table|exam|attendance)/i.test(q)) {
        if (/(exam|examination)/i.test(q)) return { intent: 'exam_schedule' };
        if (/(attendance|rule|leave)/i.test(q)) return { intent: 'attendance_rules' };
        if (/(transport|bus|route)/i.test(q)) return { intent: 'transport_schedule' };
        return { intent: 'working_hours' };
    }

    // HOD intent
    if (q.includes('hod') || q.includes('head of department') || q.includes('head') ) {
        const dept = await matchDepartmentFromText(q);
        return { intent: 'hod_query', entities: { department: dept } };
    }

    // college-level intents
    if (/(how many|number of|how many branches|how many departments|count of departments)/i.test(q) || q.includes('branches') || q.includes('departments')) {
        return { intent: 'college_branches' };
    }
    if (q.includes('pharmacy') || q.includes('pharm')) return { intent: 'college_pharmacy' };
    if (q.includes('college') && (q.includes('name') || q.includes('located') || q.includes('where'))) return { intent: 'college_info' };

    // facilities
    const facilityKeywords = ['library','hostel','canteen','wifi','lab','labs','placement','placements','exam','exams','event','events'];
    if (tokens.some(t => facilityKeywords.includes(t))) return { intent: 'facility_query' };

    // department generic
    const maybeDept = await matchDepartmentFromText(q);
    if (maybeDept) return { intent: 'department_query', entities: { department: maybeDept } };

    // fallback
    return { intent: 'general' };
}

// Load campus data
async function loadCampusData() {
    try {
        const response = await fetch('campusData.json');
        campusData = await response.json();
    } catch (error) {
        console.error('Error loading campus data:', error);
        addMessage('Sorry, I am having trouble accessing the campus information. Please try again later.', 'bot');
    }
}

// Initialize chatbot
async function initChatbot() {
    await loadCampusData();
    initializeSpeechRecognition();
    setupEventListeners();
}

// Initialize Speech Recognition
function initializeSpeechRecognition() {
    if ('webkitSpeechRecognition' in window) {
        speechRecognition = new webkitSpeechRecognition();
        speechRecognition.continuous = false;
        speechRecognition.interimResults = false;
        speechRecognition.lang = currentLanguage;

        speechRecognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            userInput.value = transcript;
            handleUserInput();
        };

        speechRecognition.onend = () => {
            isListening = false;
            voiceInputButton.innerHTML = '<i class="material-icons">mic</i>';
            voiceInputButton.classList.remove('listening');
        };

        speechRecognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            showNotification('Error with voice input. Please try again.', 'error');
            isListening = false;
            voiceInputButton.innerHTML = '<i class="material-icons">mic</i>';
            voiceInputButton.classList.remove('listening');
        };
    } else {
        voiceInputButton.style.display = 'none';
        showNotification('Voice input is not supported in your browser.', 'error');
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Send button and Enter key
    if (sendButton) {
        sendButton.addEventListener('click', () => handleUserInput());
    }
    if (userInput) {
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleUserInput();
        });
    }

    // Voice input button
    if (voiceInputButton) {
        voiceInputButton.addEventListener('click', toggleVoiceInput);
    }

    // Toggle voice output button
    if (toggleVoiceButton) {
        toggleVoiceButton.addEventListener('click', () => {
            isVoiceEnabled = !isVoiceEnabled;
            toggleVoiceButton.innerHTML = `<i class="material-icons">${isVoiceEnabled ? 'volume_up' : 'volume_off'}</i>`;
            showNotification(`Voice output ${isVoiceEnabled ? 'enabled' : 'disabled'}`, 'success');
        });
    }

    // Language selection
    if (languageSelect) {
        languageSelect.addEventListener('change', (e) => {
            currentLanguage = e.target.value;
            if (speechRecognition) {
                speechRecognition.lang = currentLanguage;
            }
        });
    }
}

// Toggle Voice Input
function toggleVoiceInput() {
    if (!speechRecognition) return;

    if (isListening) {
        speechRecognition.stop();
    } else {
        speechRecognition.start();
        isListening = true;
        voiceInputButton.innerHTML = '<i class="material-icons">mic_none</i>';
        voiceInputButton.classList.add('listening');
        showNotification('Listening...', 'success');
    }
}

// Speak Text
function speakText(text) {
    if (!isVoiceEnabled) return;
    
    speechSynthesis.cancel(); // Stop any current speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = currentLanguage;
    
    // Select a voice that matches the language
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.startsWith(currentLanguage.split('-')[0])) || voices[0];
    if (voice) utterance.voice = voice;

    speechSynthesis.speak(utterance);
}

// Show Notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.getElementById('notificationContainer').appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Handle user input
async function handleUserInput() {
    if (!userInput) {
        console.error('User input element not found');
        return;
    }

    const message = userInput.value.trim();
    if (message === '') return;

    // Disable input while processing
    if (userInput) userInput.disabled = true;
    if (sendButton) sendButton.disabled = true;
    if (voiceInputButton) voiceInputButton.disabled = true;

    // Add user message to chat
    addMessage(message, 'user');
    userInput.value = '';

    // Show typing indicator
    typingIndicator.classList.add('visible');

    try {
        // Process the message and respond with a delay for natural feeling
        await new Promise(resolve => setTimeout(resolve, 500));
        const response = await processUserQuery(message.toLowerCase());
        
        // Hide typing indicator and add response
        typingIndicator.classList.remove('visible');
        await new Promise(resolve => setTimeout(resolve, 300));
        addMessage(response, 'bot');

        // Speak the response if voice is enabled
        if (isVoiceEnabled) {
            speakText(response);
        }
    } catch (error) {
        console.error('Error processing query:', error);
        showNotification('Sorry, there was an error processing your request.', 'error');
    }

    // Re-enable input
    userInput.disabled = false;
    sendButton.disabled = false;
    voiceInputButton.disabled = false;
    userInput.focus();
}

// Process user query and find relevant information
async function processUserQuery(query) {
    // NLP analyze first
    const nlp = await nlpAnalyze(query);

    // Handle simple intents
    if (nlp.intent === 'greeting') {
        return conversationPatterns.greetings.responses[Math.floor(Math.random() * conversationPatterns.greetings.responses.length)];
    }
    if (nlp.intent === 'farewell') {
        return conversationPatterns.farewell.responses[Math.floor(Math.random() * conversationPatterns.farewell.responses.length)];
    }
    if (nlp.intent === 'help') return conversationPatterns.help.responses[0];

    // College level intents
    if (nlp.intent === 'college_location' || nlp.intent === 'college_establishment' || 
        nlp.intent === 'college_accreditation' || nlp.intent === 'college_contact' || 
        nlp.intent === 'college_facilities' || nlp.intent === 'college_admission' || 
        nlp.intent === 'college_placement' || nlp.intent === 'college_branches' || 
        nlp.intent === 'college_pharmacy' || nlp.intent === 'college_info') {
        const collegeResp = await handleCollegeQuery(query);
        if (collegeResp) return collegeResp;
    }

    // Department intents
    if (nlp.intent === 'hod_query' && nlp.entities?.department) {
        // direct HOD answer via DataManager
        const hod = await DataManager.getHODInfo(nlp.entities.department);
        if (hod) {
            const dept = await DataManager.getDepartmentInfo(nlp.entities.department);
            return DataManager.formatResponse(dept, 'hod');
        }
    }

    if (nlp.intent === 'department_query' && nlp.entities?.department) {
        const dept = await DataManager.getDepartmentInfo(nlp.entities.department);
        if (dept) return DataManager.formatResponse(dept, 'department');
    }

    if (nlp.intent === 'facility_query') {
        // fallback to existing keyword matching
    }

    // Handle other queries using existing logic
    let relevantData = null;
    let keywordFound = '';

    // Load campus data if needed
    if (!campusData) {
        try {
            await loadCampusData();
        } catch (error) {
            return "I'm sorry, but I'm having trouble accessing the campus information. Please try again later.";
        }
    }

    for (const [keyword, path] of Object.entries(keywords)) {
        if (query.includes(keyword)) {
            keywordFound = keyword;
            relevantData = findInformation(path, query);
            if (relevantData) break;
        }
    }

    // Format and return response if campus data is found
    if (relevantData) {
        return formatResponse(keywordFound, relevantData, query);
    }

    // If no campus data found, avoid calling external AI from client-side in local/dev.
    // Provide a safe, contextual fallback so the chat works offline / without API keys.
    try {
        console.warn('External AI call disabled in client; returning local fallback response.');

        // Attempt some lightweight contextual fallbacks before generic message
        const lowQ = query.toLowerCase();
        if (lowQ.includes('location') || lowQ.includes('where')) {
            const locResp = await handleCollegeQuery(query);
            if (locResp) return locResp;
        }
        if (lowQ.includes('hod') || lowQ.includes('head of department')) {
            const dept = await matchDepartmentFromText(query);
            if (dept) {
                const d = await DataManager.getDepartmentInfo(dept);
                if (d) return DataManager.formatResponse(d, 'hod');
            }
        }

        // Generic helpful fallback that doesn't require external API
        return "I'm not sure about that right now. Try asking about departments, HODs, facilities, placements or the college location — or check the college website at https://gcet.edu.in/ for official details.";
    } catch (error) {
        console.error('Local fallback error:', error);
        return "I'm not sure about that — please check the college website or contact the office.";
    }
}

// Find information in campus data based on path and query
function findInformation(path, query) {
    let data = campusData;
    
    // Navigate through the data structure
    for (const key of path) {
        if (Array.isArray(data)) {
            // For arrays (like departments), search through each item
            return data.find(item => 
                Object.values(item).some(value => 
                    String(value).toLowerCase().includes(query)
                )
            );
        }
        data = data[key];
        if (!data) return null;
    }
    
    return data;
}

    // Format response based on the type of information and query context
function formatResponse(keyword, data, query) {
    const q = query.toLowerCase();
    
    switch(keyword) {
        case 'library':
            if (/timing|hour|open|when/i.test(q)) {
                return `The library is open ${data.timings}`;
            }
            if (/where|location/i.test(q)) {
                return `The library is located in the ${data.location}`;
            }
            if (/resource|book|journal|read/i.test(q)) {
                return `Our library offers ${data.resources.join(', ')}`;
            }
            return `The ${data.name} is located in the ${data.location}. It's open ${data.timings} and offers ${data.resources.join(', ')}.`;
        
        case 'hostel':
            if (/facility|amenity|provide/i.test(q)) {
                return `Our hostels provide: ${data.facilities.join(', ')}`;
            }
            if (/type|available|have/i.test(q)) {
                return `We have ${data.types.join(' and ')} facilities for students`;
            }
            if (/security|safe/i.test(q)) {
                return `Yes, our hostels are equipped with security and other facilities including ${data.facilities.join(', ')}`;
            }
            return `We provide hostel facilities for both boys and girls. Available amenities include: ${data.facilities.join(', ')}.`;
        
        case 'wifi':
            if (/speed|fast/i.test(q)) {
                return `We provide ${data.access} with ${data.coverage} coverage`;
            }
            if (/support|help|issue/i.test(q)) {
                return `For WiFi support, please contact the ${data.support}`;
            }
            return `We provide ${data.coverage} WiFi access ${data.access}. For support, contact ${data.support}.`;
        
        case 'department':
        case 'hod':
            if (/hod|head/i.test(q)) {
                return `The Head of Department is ${data.hod.name}, ${data.hod.designation}`;
            }
            if (/course|program|branch/i.test(q)) {
                return `${data.name} department offers ${data.programs.join(', ')}`;
            }
            if (/contact|email|phone/i.test(q)) {
                return `You can contact the ${data.name} department at ${data.contact.email} or ${data.contact.phone}`;
            }
            if (/where|location|block/i.test(q)) {
                return `The ${data.name} department is located in ${data.location}`;
            }
            return `${data.name} Department is headed by ${data.hod.name}. It's located in ${data.location} and offers ${data.programs.join(', ')}.`;
        
        case 'event':
            if (/when|date|time/i.test(q)) {
                return `${data.name} is scheduled for ${data.date}`;
            }
            if (/where|venue|location/i.test(q)) {
                return `${data.name} will be held at ${data.venue}`;
            }
            if (/what|detail|about/i.test(q)) {
                return `${data.description}`;
            }
            return `${data.name} will be held on ${data.date} at ${data.venue}. ${data.description}`;
        
        case 'placement':
            if (/package|salary|ctc/i.test(q)) {
                return `Our placement packages range from average ${data.statistics.averagePackage} to highest ${data.statistics.highestPackage}`;
            }
            if (/company|recruiter/i.test(q)) {
                return `${data.statistics.companiesVisited} companies visited for placements, including ${data.topRecruiters.slice(0, 5).join(', ')} and more`;
            }
            if (/how many|placed|student/i.test(q)) {
                return `${data.statistics.studentsPlaced} students were placed with a placement rate of ${data.statistics.placementRate}`;
            }
            return `Last year, ${data.statistics.studentsPlaced} students were placed with packages ranging from ${data.statistics.averagePackage} to ${data.statistics.highestPackage}.`;
        
        case 'exam':
            if (/when|date|schedule/i.test(q)) {
                return `${data.name} is scheduled from ${data.date}`;
            }
            if (/where|venue|hall/i.test(q)) {
                return `${data.name} will be conducted at ${data.venue}`;
            }
            return `${data.name} will be held from ${data.date} at ${data.venue}`;
        
        default:
            return "I'm not sure about that — please check the college website or contact the office.";
    }
}// Add message to chat
function addMessage(message, sender) {
    if (!chatMessages) {
        console.error('Chat messages container not found');
        return;
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.textContent = message;
    
    messageDiv.appendChild(messageContent);
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Initialize the chatbot when the page loads
initChatbot();