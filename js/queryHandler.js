class QueryHandler {
    static async handleDepartmentQuery(query) {
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
    }

    static async processChatMessage(message) {
        const lowerMsg = message.toLowerCase();
        
        // Department related queries
        if (lowerMsg.includes('hod') || lowerMsg.includes('head of department') ||
            lowerMsg.includes('department') || /\b(cse|ece|eee|mech|civil)\b/i.test(lowerMsg)) {
            return this.handleDepartmentQuery(message);
        }

        return null; // Return null if query is not department related
    }
}