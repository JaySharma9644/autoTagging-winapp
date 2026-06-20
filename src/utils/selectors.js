/**
 * Selectors Module
 * Centralized CSS/XPath selectors for portal elements
 */

export const SELECTORS = {
    // Login form selectors (iframe-aware)
    LOGIN: {
        USER: ['#txtusr', '[name="txtUser"]', 'input[type="text"]'],
        PASSWORD: ['#txtpwd', '[name="txtpwd"]', 'input[type="password"]'],
        SUBMIT: ['#btnSubmit', 'input[type="submit"]', 'button[type="submit"]', 'input[value="Submit" i]', 'text="Submit"'],
    },
    
    // Navigation selectors
    NAVIGATION: {
        TRANSPORTER: 'text="Transporter"',
        EPASS_MENU: 'a:has-text("ePass")',
        REQUEST_FOR_VEHICLE: 'a:has-text("Request For Vehicle")',
        NEW_REQUEST: 'a:has-text("New Request")',
        NO_RECORDS_FOUND: 'td:has-text("No Record(s) Found...")',
        VIEW_REQUEST_STATUS: 'a:has-text("View Request Status")',
        TAG_MORE_VEHICLE: 'td a:has-text("Tag More Vechile")',
    },
    
    // Vehicle processing selectors
    VEHICLE_PROCESSING: {
        SEARCH_INPUT: '#txtVehicleNo',
        SEARCH_BUTTON: 'text="Search"',
        ALREADY_TAGGED: 'text="VEHICLE IS ALREADY TAGGED ON THIS PERMIT"',
        RESET_BUTTON: '#btnCancel',
    },

    
    
    // CONTROLS  selectors
    TAGCONTROLS: {
        CONTAINER: '#tblGPS',
        VTS: '#tblGPS',
        GPSFITTED: 'name="rdo_GPS"',
        GPSFITTEDYES: 'input[name="rdo_GPS"][id="rdo_GPS_0"]',
        GPSFITTEDNO: 'input[name="rdo_GPS"][id="rdo_GPS_1"]',
        VTSACTIVE: 'text="VTS Active"',
        VTSACTIVEYES  :'input[name="Rdo_VTS"][id="Rdo_VTS_0"]',
        VTSACTIVENO  :'input[name="Rdo_VTS"][id="Rdo_VTS_1"]',
        SIMVALID: 'text="SIM Validity"',
        SIMVALIDYES: 'input[name="Rdo_SIM"][id="Rdo_SIM_0"]',
        SIMVALIDNO: 'input[name="Rdo_SIM"][id="Rdo_SIM_1"]',
        ACKNOWLEDGEMENT: 'text="Acknowledgement"',
        ACK: '#chkClick',
        CAPTCHAIMAGE: '#imgCaptch',
        CAPTCHAINPUT: '#txtcaptcha',
        SUBMIT_BUTTON: '#btnSubmit',
        RESET_BUTTON: '#btnCancel',
        VEHICLETAGSUCCESS: 'text="Vehicle tagged successfully"', 
        OK_BUTTON: 'text="OK"',
    },
    
    // Success/Error selectors
    RESULTS: {
        DASHBOARD: '.dashboard-welcome, .dashboard, [class*="dashboard"]',
        SUCCESS_MESSAGE: '.success-message',
        LOGIN_ERROR: '.login-error, .error-message, .alert-danger, [class*="error"], [class*="fail"]',
    },
};
