const axios = require('axios');
const cheerio = require('cheerio');

const cpaList = [
    'id=Bwa1N817ZPc%3d&p=MIGUEL&n=THIBAULT',
    'id=Os12QGBAukA%3d&p=ARNAU&n=DÉRY-THERRIEN',
    'id=Bqga0nFyJ10%3d&p=MARIE-FRANCE&n=CLOUTIER',
    'id=yMCc%2bIejJU4%3d&p=PIERRE-ALEXANDRE&n=CARON',
    'id=VMCIUzscC00%3d&p=ARIANE&n=VILLEMURE',
    'id=x6JQu1hEjiA%3d&p=PATRICK&n=SAMSON',
    'id=K11Wl2A855o%3d&p=JULIE&n=BÉRUBÉ',
    'id=tY7IuyUAjwc%3d&p=PATRICK&n=BROUILLETTE',
    'id=MVORCBeMAsU%3d&p=CAROLINE&n=FILLION',
    'id=flxC07S8GIw%3d&p=SÉBASTIEN&n=PAYETTE',
    'id=KZuLg5AjRgQ%3d&p=MARIE-FRÉDÉRIQUE&n=ALAIN',
    'id=2qtTHrhAj%2fw%3d&p=MICHAEL&n=LITWIN',
    'id=UElnJBVftLI%3d&p=JEFFREY&n=KATZ',
    'id=ZVIrbiFOdhM%3d&p=JEREMY&n=LEVI',
    'id=1TBdXxUPc8c%3d&p=JEAN&n=MILOT',
    'id=cfNEBE9tsw8%3d&p=TRAN HUNG&n=LUONG',
    'id=qL1YWWLxKr0%3d&p=JULIEN&n=LAPENSÉE-LAFOND',
    'id=sLCkVrU8Bgc%3d&p=NICOLAS&n=LESAGE',
    'id=dmjy40hXPUM%3d&p=GRATIEN&n=ROY',
    'id=wBQC8q8MHO4%3d&p=NEPTUNE&n=PIERRE',
    'id=VXeUDD%2fPOvY%3d&p=CHRISTINE&n=BIZIEN',
    'id=NM%2b4dfdk8VM%3d&p=PIERRE&n=PARENT',
    'id=AbktlMZa4ks%3d&p=SYLVAIN&n=MOREAU',
    'id=GvSKnkvGONE%3d&p=OLIVIER&n=GARON-VINCENT',
    'id=lpG6ZKrtcYA%3d&p=RHÉAL JR&n=BRUNET',
    'id=HifrAcCJhiY%3d&p=ANDRÉANNE&n=COUTURE',
    'id=PmdCvlB%2fJNk%3d&p=CÉDRICK&n=LANGEVIN',
    'id=b%2b03U10mK7g%3d&p=CÉDRICK&n=BRIÈRE',
    'id=QlGc21wBddc%3d&p=ALAIN&n=BRIÈRE',
    'id=TnTOsiSNObE%3d&p=JEAN-PIERRE&n=AYOTTE',
    'id=IdMsR1hQjQc%3d&p=JEAN-FRANÇOIS&n=QUESNEL',
    'id=tiPQezkkvEE%3d&p=MÉLINA&n=BLANCHETTE',
    'id=mQf1S9K7cMk%3d&p=SYLVAIN&n=ROY',
    'id=A8rbFU1JAxE%3d&p=ANTHONY&n=MCFADDEN',
    'id=jhSd92BziaQ%3d&p=ANNIE&n=COTNOIR',
    'id=4xSZ4fXG1Nk%3d&p=CHRISTIAN&n=GENDRON',
    'id=pY0fn2ZgQk8%3d&p=ARMAND THIERRY&n=MESSOU',
    'id=5twBLnIt7JI%3d&p=MÉLANIE&n=FRIGON DUCHAINE',
    'id=MI%2f0bfWsalg%3d&p=LEONCE HERVE KOUASSI&n=ATTA',
    'id=1AjGVOhboxI%3d&p=SYLVAIN&n=DESMEULES',
    'id=hTg9A34mc5E%3d&p=GENEVIÈVE&n=GENEST',
    'id=BPzmI%2fCYxRM%3d&p=CHRISTINE&n=BOUDREAU',
    'id=Mdk5nXw%2bce4%3d&p=CATHERINE&n=JEAN',
    'id=BOvQC7Yvd18%3d&p=LAURY&n=LAPOINTE',
    'id=%2fCP8nt%2fQw5E%3d&p=ERIKA&n=NOËL',
    'id=Q1871NS%2b4qQ%3d&p=GENEVIÈVE&n=MILLETTE'
];

async function scrapeCPAInfo(urlParams) {
    try {
        const url = `https://cpaquebec.ca/en/find-a-cpa/orders-membership-roll/contact-information/?${urlParams}&pn=`;
        
        // Decode and log the URL parameters
        const decodedParams = decodeURIComponent(urlParams);
        console.log('\nRequesting data for:', decodedParams);
        
        // Make the GET request
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const vcardInfo = $('#AjaxDetailForm > div > div > div > ul.vcard');
        
        const name = vcardInfo.find('h3').text();
        const company = vcardInfo.find('strong').text();
        const address = vcardInfo.find('.street-address p').text();
        const phone = vcardInfo.find('li:contains("Phone:") p').text();
        const permitNumber = vcardInfo.find('li:contains("Public accountancy permit number:") p').text();

        const cpaInfo = {
            name,
            company,
            address,
            phone,
            permitNumber
        };

        // Log all CPAs regardless of permit number
        console.log('----------------------------------------');
        console.log('Name:', name);
        console.log('Company:', company);
        console.log('Address:', address);
        console.log('Phone:', phone);
        console.log('Permit Number:', permitNumber || 'No permit number');
        console.log('----------------------------------------\n');

        return cpaInfo;

    } catch (error) {
        console.error('Error scraping data for URL params:', urlParams, ':', error.message);
        return null;
    }
}

async function scrapeAllCPAs() {
    const results = [];
    
    // Add a small delay between requests to be respectful to the server
    for (const urlParams of cpaList) {
        const result = await scrapeCPAInfo(urlParams);
        if (result) {
            results.push(result);
        }
        // Wait 1 second between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\nSummary:');
    console.log(`Successfully scraped ${results.length} out of ${cpaList.length} CPAs`);
}

scrapeAllCPAs(); 