import '../homepage.css';
import Link from "next/link";
import Image from 'next/image';
import React from 'react';
import EventList from "../event-list";
import SponsorList from '../sponsor-list';
import DragonList from '../dragon-list';
import Featurettes from '../Featurettes';
import BecomeMemberButton from '../BecomeMemberButton';
import DiscordIcon from '../../public/images/discord-icon.svg';
import VoidLogo from '../../public/images/Void_Logo_WhiteTransparent.png';

import { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale = 'nl' } = await params;
    const isNl = locale === 'nl';

    return {
        title: isNl ? 'Tarragon | D&D, Boardgames & Geek Community Kortrijk' : 'Tarragon | D&D, Boardgames & Geek Community in Kortrijk',
        description: isNl 
            ? 'Tarragon is de tabletop geek community in Kortrijk voor Dungeons & Dragons, boardgames (bordspellen), LARP, minipainting en meer. Sluit je aan bij onze wekelijkse speelavonden!'
            : 'Tarragon is the tabletop geek community in Kortrijk for Dungeons & Dragons, board games, LARP, minipainting, and more. Join our weekly gaming nights!',
        alternates: {
            canonical: `/${locale}`,
            languages: {
                'nl': '/nl',
                'en': '/en',
                'x-default': '/nl',
            },
        },
    };
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
    const { locale = 'nl' } = await params;

    return (
        <div className="container">
            <div className="infobox">
                <h1>{locale === 'nl' ? 'Tarragon Kortrijk | D&D & Boardgames' : 'Tarragon Kortrijk | D&D & Board Games'}</h1>
                <p>
                    {locale === 'nl' 
                        ? 'Tarragon is dé ontmoetingsplaats voor tabletop geeks in Kortrijk. Of je nu komt voor wekelijkse Dungeons & Dragons sessies, strategische bordspellen (boardgames), minipainting workshops of LARP—er is altijd een plekje aan onze tafel.'
                        : 'Tarragon is the premier meeting place for tabletop geeks in Kortrijk. Whether you’re joining us for weekly Dungeons & Dragons sessions, strategic board games, minipainting workshops, or LARP—there’s always a seat at our table.'
                    }
                    <br /><br />
                    {locale === 'nl' ? 'Elke woensdagavond' : 'Every Wednesday evening'} van 19:00 tot 22:00 @ <Link href='https://www.bolwerk.be/projecten/het-textielhuis' className="location-link">Het Textielhuis</Link> (<Link href='https://maps.app.goo.gl/FVc87bcAtS4VVuip8' className="location-link">Rijselsestraat 19, 8500 Kortrijk</Link>).
                </p>
                <div className="welcome-badges">
                    <span className="badge">{locale === 'nl' ? 'Bordspellen & TTRPG' : 'Boardgames & TTRPG'}</span>
                    <span className="badge">Minipainting & LARP</span>
                    <span className="badge">Kortrijk Geek Community</span>
                </div>
                <div className="infobox-actions">
                    <Link href={`/${locale}/${locale === 'nl' ? 'Doneren' : 'Donate'}`} className="donate-button">
                        {locale === 'nl' ? 'Steun Tarragon VZW' : 'Support Tarragon VZW'}
                    </Link>
                    <BecomeMemberButton locale={locale} />
                </div>
            </div>
            <EventList locale={locale} />
            <Featurettes locale={locale} />
            <div className="quick-links">
                <Link href="https://discord.com/invite/TjDUu2Gkag" className="quick-link-item">
                    <span className="quick-link-icon" style={{ display: 'flex', alignItems: 'center' }}>
                        <Image 
                            src={DiscordIcon}
                            alt="Discord"
                            width={24}
                            height={24}
                        />
                    </span>
                    <span>Join our Discord</span>
                </Link>
                <Link href="https://guild.tarragon.be" className="quick-link-item">
                    <span className="quick-link-icon" style={{ display: 'flex', alignItems: 'center' }}>
                        <Image 
                            src={VoidLogo}
                            alt="Void Guild"
                            width={24}
                            height={24}
                            style={{ objectFit: 'contain' }}
                        />
                    </span>
                    <span>Guild Planning Tool</span>
                </Link>
                <Link href="https://void.tarragon.be" className="quick-link-item">
                    <span className="quick-link-icon">📜</span>
                    <span>Void Wiki</span>
                </Link>
            </div>
            <div className="koboldbox">
                <h1>Kobold Deals</h1>
                <SponsorList locale={locale} />
            </div>
            <div className="dragonbox">
                <h1>Dragons</h1>
                <DragonList locale={locale} />
            </div>
            <div className="contactbox">
                <h1>Contact</h1>
                <div className="social-footer">
                    <Link href="https://www.facebook.com/TarragonVZW">Facebook</Link>
                    <Link href="https://www.instagram.com/tarragonvzw">Instagram</Link>
                    <Link href="https://discord.com/invite/TjDUu2Gkag">Discord</Link>
                </div>
                <small>
                    <strong>Tarragon VZW</strong><br/>
                    Wijngaardstraat 15 bus 13, 8500 Kortrijk, Belgium<br/>
                    KBO / BTW: BE 0799.673.542 | RPR Gent (afdeling Kortrijk)<br/>
                    contact@tarragon.be | www.tarragon.be<br/><br/>
                    © {new Date().getFullYear()} Tarragon VZW. All rights reserved.<br/><br/>
                    <span style={{ display: 'inline-flex', gap: '1.25rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <Link href={`/${locale}/${locale === 'nl' ? 'Voorwaarden' : 'ToS'}`}>
                            {locale === 'nl' ? 'Algemene Voorwaarden' : 'Terms of Service'}
                        </Link>
                        <Link href={`/${locale}/${locale === 'nl' ? 'Privacy-Beleid' : 'Privacy-Policy'}`}>
                            {locale === 'nl' ? 'Privacy- & Cookiebeleid (GDPR)' : 'Privacy & Cookies (GDPR)'}
                        </Link>
                    </span>
                </small>
            </div>
        </div>
    );
}
