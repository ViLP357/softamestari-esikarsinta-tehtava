import { Link } from "react-router-dom";
import "./InformationalPages.css";
import mapIcon from "./assets/mapIcon.png";

function AboutPage() {
  return (
    <main className="info-page">
      <header className="info-header">
        <Link className="info-brand" to="/" aria-label="Sivupolku etusivu">
          <img className="info-brand-icon" src={mapIcon} alt="" />
          <span>Sivupolku</span>
        </Link>
        <nav className="site-nav" aria-label="Päänavigaatio">
          <Link to="/locationtest">Sijaintitesti</Link>
        </nav>
      </header>

      <article className="info-card about-card">
        <p className="info-kicker">PIENI OPAS</p>
        <h1>Näin lähdet seikkailuun</h1>
        <p className="about-lead">
          Sivupolku auttaa huomaamaan lähelläsi olevia kiinnostavia paikkoja.
          Se näyttää suunnan, mutta reitin saat keksiä itse.
        </p>

        <ol className="tutorial-steps">
          <li>
            <span>1</span>
            <div><h2>Salli sijainti</h2><p>Sovellus tarvitsee sijaintiluvan löytääkseen lähialueen kohteita ja näyttääkseen sinut kartalla. Sijainti päivittyy retken aikana.</p></div>
          </li>
          <li>
            <span>2</span>
            <div><h2>Valitse teema ja etäisyys</h2><p>Valitse Historia, Luonto, Taide, Outo tai Yllätys. Säädä sitten kohteen enimmäisetäisyys 500 metrin ja 10 kilometrin väliltä.</p></div>
          </li>
          <li>
            <span>3</span>
            <div><h2>Aloita seikkailu</h2><p>Sovellus etsii valitun kategorian OpenStreetMap-kohteita lähistöltä ja valitsee niistä yhden satunnaisesti.</p></div>
          </li>
          <li>
            <span>4</span>
            <div><h2>Seuraa suuntaa, älä reittiä</h2><p>Kartalla näkyvä katkoviiva osoittaa vain linnuntiesuunnan. Se ei ole kävelyreitti, joten huomioi ympäristö ja kulje turvallisesti. Älä kulje yksityisalueiden läpi.</p></div>
          </li>
          <li>
            <span>5</span>
            <div><h2>Löydä kohde</h2><p>Kun saavut noin 50 metrin päähän, sovellus paljastaa kohteen nimen ja voit tutustua kohteeseen paikan päällä.</p></div>
          </li>
        </ol>

        <aside className="tutorial-note">
          <strong>Vinkki:</strong> Jos sopivaa kohdetta ei löydy, suurenna hakusädettä tai kokeile toista kategoriaa. Sijaintipalvelu ja kartta vaativat verkkoyhteyden.
        </aside>

        <div className="info-actions">
          <Link className="info-primary-link" to="/">Aloita seikkailu</Link>
          <Link className="info-secondary-link" to="/locationtest">Avaa sijaintitesti</Link>
        </div>
      </article>
    </main>
  );
}

export default AboutPage;
