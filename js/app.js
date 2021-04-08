'use strict';

import Config from './config.js';

let GAPS = {
    client: null,
    clientPayer: null,
    patient: null,
    procedure: null,
    organization: null,
    pid: null
}

GAPS.getGUID = () => {
    let s4 = () => {
    return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
    };
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

GAPS.now = () => {
    let date = new Date();
    return date.toISOString();
}

GAPS.displayPatient = (pt) => {
    $('#patient-name').html(GAPS.getPatientName(pt));
}

GAPS.displayScreen = (screenID) => {
    let screens = ['intro-screen','review-screen','confirm-screen','config-screen','error-screen'];
    for (let s of screens) {
        $('#'+s).hide();
    }
    $('#'+screenID).show();
}

GAPS.displayIntroScreen = () => {
    GAPS.displayScreen('intro-screen');
}

GAPS.displayConfirmScreen = () => {
    GAPS.displayScreen('confirm-screen');
}

GAPS.displayConfigScreen = () => {
    if (Config.configSetting === "custom") {
        $('#config-select').val("custom");
    } else {
        $('#config-select').val(Config.configSetting);
    }
    $('#config-text').val(JSON.stringify(Config.payerEndpoint, null, 2));
    GAPS.displayScreen('config-screen');
}

GAPS.displayReviewScreen = () => {
    GAPS.displayScreen('review-screen');
}

GAPS.displayErrorScreen = (title, message) => {
    $('#error-title').html(title);
    $('#error-message').html(message);
    GAPS.displayScreen('error-screen');
}

GAPS.enable = (id) => {
    $("#"+id).prop("disabled",false);
}

GAPS.disable = (id) => {
    $("#"+id).prop("disabled",true);
}

GAPS.getPatientName = (pt) => {
    if (pt.name) {
        let names = pt.name.map((n) => n.given.join(" ") + " " + n.family);
        return names.join(" / ");
    } else {
        return "anonymous";
    }
}

GAPS.generatePayload = (patientResource, procedureResource, organizationResource) => {
    let timestamp = GAPS.now();
    let measurereport = Config.operationPayload.parameter.find(e => e.name === "measureReport");
    let patient = Config.operationPayload.parameter.find(e => e.name === "resource" && e.resource.resourceType === "Patient");
    let procedure = Config.operationPayload.parameter.find(e => e.name === "resource" && e.resource.resourceType === "Procedure");
    let organization = Config.operationPayload.parameter.find(e => e.name === "resource" && e.resource.resourceType === "Organization");

    Config.operationPayload.id = GAPS.getGUID();
    measurereport.resource.id = GAPS.getGUID();

    patient.resource = patientResource;
    procedure.resource = procedureResource;
    organization.resource = organizationResource;

    measurereport.resource.subject.reference = "Patient/" + patient.resource.id;
    measurereport.resource.date = timestamp;
    measurereport.resource.period.start = procedureResource.performedPeriod.start;
    measurereport.resource.period.end = procedureResource.performedPeriod.end;
    measurereport.resource.reporter.reference = "Organization/" + organization.resource.id;
    measurereport.resource.evaluatedResource[0].reference = "Procedure/" + procedure.resource.id;
    patient.resource.managingOrganization.reference = "Organization/" + organization.resource.id;

    Config.operationPayload.parameter = [measurereport, patient, procedure, organization];

    return Config.operationPayload;
}

GAPS.loadData = async () => {
    let out = '';

    GAPS.pid = GAPS.client.patient.id;

    GAPS.patient = await GAPS.client.patient.read()
    GAPS.displayPatient (GAPS.patient);

    let orgID = GAPS.patient.managingOrganization.reference.split('/')[1];

    GAPS.organization = await GAPS.client.request(`Organization/${orgID}`);
    let procedures = await GAPS.client.patient.request(`Procedure?code=http://www.ama-assn.org/go/cpt|44393`,{pageLimit:0,flat:true});
    
    if (procedures.length > 0) {
        GAPS.procedure = procedures[0];
    } else {
        GAPS.procedure = null;
    }

    const url = 'Measure/$care-gaps?periodStart=' + Config.payerEndpoint.periodStart + '&periodEnd=' + Config.payerEndpoint.periodEnd + '&subject=Patient/' + GAPS.pid + '&measureId=' + Config.payerEndpoint.measureID + "&status=open-gap&status=closed-gap";

    const gaps = await GAPS.clientPayer.request({
        method: 'GET',
        url: url,
        // TODO: does it need accepts header?
        headers:{
            'Content-Type': 'application/fhir+json'
        }
    });

    const issues = gaps.parameter.find((e) => e.name === "return" && e.resource.resourceType === "Bundle")
                       .resource.entry.filter((e) => e.resource.resourceType === "DetectedIssue")
                       .map((e) => e.resource)
                       .filter((e) => e.modifierExtension.find(t => t.valueCodeableConcept.coding.find((c) => c.system === 'http://hl7.org/fhir/us/davinci-deqm/CodeSystem/gaps-status' && c.code === 'open-gap')));

    const hasGap = issues.length > 0;
    const hasProcedure = GAPS.procedure;

    if (hasGap) {
        $('#gaps-disposition').html("Gap in Care reported");
        //out += hasProcedure?"Gap can be closed with procedure":"No procedure available to close gap";
    } else {
        $('#gaps-disposition').html("No Gap in Care reported");
    }

    $('#buttonCareGap').html(Config.payerEndpoint.url + url);
    $('#outputCareGaps').html(JSON.stringify(gaps, null, '  '));
    $('#accordionCareGaps').show();

    if (hasGap && hasProcedure) {
        $('#btn-reset').hide();
        $('#btn-submit').show();
        GAPS.enable('btn-submit');

    } else {
        $('#btn-submit').hide();
        $('#btn-reset').show();
        GAPS.disable('btn-submit');
    }

    $("#spinner").hide();
    $("#gaps-info").html(out + "<br>");
}

GAPS.submit = async () => {

    GAPS.disable('btn-reset');
    GAPS.disable('btn-configuration');
    GAPS.disable('btn-submit');

    $('#btn-submit').html("<i class='fa fa-circle-o-notch fa-spin'></i> Close gap");

    GAPS.generatePayload(GAPS.patient, GAPS.procedure, GAPS.organization);
    GAPS.finalize();
}

GAPS.initialize = (client) => {
    GAPS.client = client;
    GAPS.displayIntroScreen();
    GAPS.loadConfig();
    GAPS.loadData();
}

GAPS.loadConfig = () => {
    let configText = window.localStorage.getItem("GAPS-app-config");
    if (configText) {
        let conf = JSON.parse (configText);
        if (conf['custom']) {
            Config.payerEndpoint = conf['custom'];
            Config.configSetting = "custom";
        } else {
            Config.payerEndpoint = Config.payerEndpoints[conf['selection']];
            Config.configSetting = conf['selection'];
        }
    }
    GAPS.clientPayer = new FHIR.client(Config.payerEndpoint.url);
}

GAPS.finalize = async () => {
    try {

        let url = Config.submitEndpoint.replace("MEASUREID", Config.payerEndpoint.measureID);
        await GAPS.clientPayer.request({
            method: 'POST',
            url: url,
            body: JSON.stringify(Config.operationPayload),
            headers:{
                'Content-Type': 'application/fhir+json'
            }
        });
        $("#submit-endpoint").html("POST " + Config.payerEndpoint.url.replace(/\/$/, "") + url);
        $("#text-output").html(JSON.stringify(Config.operationPayload, null, '  '));

        /*
        await GAPS.clientPayer.request({
            method: 'POST',
            url: 'Procedure',
            body: JSON.stringify(GAPS.procedure),
            headers:{
                'Content-Type': 'application/fhir+json'
            }
        });
        $("#submit-endpoint").html("POST " + Config.payerEndpoint.url.replace(/\/$/, "") + '/Procedure');
        $("#text-output").html(JSON.stringify(GAPS.procedure, null, '  '));
        */

        GAPS.displayConfirmScreen();
    } catch (err) {
        GAPS.displayErrorScreen("Procedure report submission failed", "Please check the submit endpoint configuration");
    }
}

GAPS.restart = () => {
    $("#gaps-info").empty();
    $("#spinner").show();
    $('#btn-reset').hide();
    $('#btn-submit').hide();
    $('#accordionCareGaps').hide();
    GAPS.enable('btn-reset');
    GAPS.enable('btn-configuration');
    GAPS.enable('btn-submit');
    $('#btn-submit').html("Close gap");
    GAPS.displayReviewScreen();
    GAPS.loadData();
}

GAPS.reset = async () => {
    try {
        $('#btn-reset').hide();
        $('#accordionCareGaps').hide();
        $("#gaps-info").empty();
        $("#spinner").show();
        let url = 'Procedure?subject=' + GAPS.pid;
        await GAPS.clientPayer.request({
            method: 'DELETE',
            url: url
        });
        GAPS.loadData();
    } catch (err) {
        GAPS.displayErrorScreen("Reset failed", "Please check the submit endpoint configuration");
    }
}


$('#btn-restart').click(GAPS.restart);
$('#btn-start').click(GAPS.displayReviewScreen);
$('#btn-reset').click(GAPS.reset);
$('#btn-submit').click(GAPS.submit);
$('#btn-configuration').click(GAPS.displayConfigScreen);
$('#btn-config').click(() => {
    let selection = $('#config-select').val();
    if (selection !== 'custom') {
        window.localStorage.setItem("GAPS-app-config", JSON.stringify({'selection': parseInt(selection)}));
    } else {
        let configtext = $('#config-text').val();
        let myconf;
        try {
            myconf = JSON.parse(configtext);
            window.localStorage.setItem("GAPS-app-config", JSON.stringify({'custom': myconf}));
        } catch (err) {
            alert ("Unable to parse configuration. Please try again.");
        }
    }
    GAPS.loadConfig();
    GAPS.displayReviewScreen();
});

Config.payerEndpoints.forEach((e, id) => {
    $('#config-select').append("<option value='" + id + "'>" + e.name + "</option>");
});
$('#config-select').append("<option value='custom'>Custom</option>");
$('#config-text').val(JSON.stringify(Config.payerEndpoints[0],null,"   "));

$('#config-select').on('change', function () {
    if (this.value !== "custom") {
        $('#config-text').val(JSON.stringify(Config.payerEndpoints[parseInt(this.value)],null,2));
    }
});

$('#config-text').bind('input propertychange', () => {
    $('#config-select').val('custom');
});

FHIR.oauth2.ready(GAPS.initialize);