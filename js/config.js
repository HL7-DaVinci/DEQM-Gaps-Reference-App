let Config = {};

Config.clientSettings = {
  "client_id": "fcffd0d3-5e0c-42d7-b22e-31e674914be0",
  "scope"    : "patient/*.* openid profile"
}

Config.submitEndpoint = "/Measure/MEASUREID/$submit-data";

Config.payerEndpoints = [{
    "name": "Alphora (Open)",
    "type": "open",
    "url": "https://gic-sandbox.alphora.com/cqf-ruler-r4/fhir/",
    "periodStart": "2020-01-01",
    "periodEnd": "2020-12-31",
    "measureID": "measure-EXM130-7.3.000"
  }
]

// default configuration
Config.configSetting = 0; // Alphora (Open)
Config.payerEndpoint = Config.payerEndpoints[Config.configSetting];

Config.operationPayload = {
    "resourceType": "Parameters",
    "id": "OPERATIONID",
    "parameter": [
      {
        "name": "measureReport",
        "resource": {
            "resourceType": "MeasureReport",
            "meta": {
              "profile": ["http://hl7.org/fhir/us/davinci-deqm/STU3/StructureDefinition/measurereport-deqm"]
            },
            "id": "MEASUREREPORTID",
            "status": "complete",
            "type": "individual",
            "measure": {
                "reference": "https://ncqa.org/fhir/ig/Measure/measure-col"
            },
            "subject": {
                "reference": "Patient/PATIENTID"
            },
            "date": "TIMESTAMP",
            "period": {
                "start": "TIMESTAMP",
                "end": "TIMESTAMP"
            },
            "reporter": {
                "reference": "Organization/ORGANIZATIONID"
            },
            "evaluatedResource": [{
                "reference": "Procedure/PROCEDUREID"
            }]
        }
      },
      {
        "name": "resource",
        "resource": {
            "resourceType": "Patient"
        }
      },
      {
        "name": "resource",
        "resource": {
            "resourceType": "Organization"
        }          
      },
      {
        "name": "resource",
        "resource": {
            "resourceType": "Procedure"
        }          
      }
    ]
}

export default Config;