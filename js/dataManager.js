class DataManager {
    static async loadDepartmentData() {
        try {
            const response = await fetch('./data/departments.json');
            return await response.json();
        } catch (error) {
            console.error('Error loading department data:', error);
            return null;
        }
    }

    static async getDepartmentInfo(deptCode) {
        const data = await this.loadDepartmentData();
        return data?.departments?.[deptCode.toLowerCase()];
    }

    static async getHODInfo(deptCode) {
        const dept = await this.getDepartmentInfo(deptCode);
        return dept?.hod;
    }

    static formatResponse(info, query) {
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
            `.replace(/^\s+/gm, ''); // Remove leading spaces
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
        `.replace(/^\s+/gm, ''); // Remove leading spaces
    }
}