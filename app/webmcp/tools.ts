export function registerWebMCPTools(){
    if (typeof document === "undefined" || !document.modelContext){
        return;
    }
    document.modelContext.registerTool({
        name: "get_system_status",
        title:"Get System Status",
        description: "Returns the current health and operational status of all production services.",

        inputSchema:{
            type: "object",
            properties:{},
            additionalProperties: false,
        },
        execute: async ()=>{
            return{
                timestamp: new Date().toISOString(),
                services:[
                {
                    name: "checkout-api",
                    status:"degraded",
                    errorRate: 0.39,
                },{
                    name:"payment-service",
                    status:"down",
                    errorRate: 0.82,
                }, {
                    name:"auth-service",
                    status:"healthy",
                    errorRate: 0.01,
                },
                ],
            };
        },

    });
}