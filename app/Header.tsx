"use client";

import Link from "next/link";
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Globe } from 'lucide-react';
import HeaderPages from './headerpages';
import { SignInButton, SignedIn, SignedOut, UserButton, useClerk } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import MembershipSection from "./MembershipSection";
import {
    createKoboldCheckoutSessionAction,
    createCustomerPortalSessionAction,
} from "./actions/stripe";

import TarragonTiny from "../public/images/Tarragon_Tiny.svg";
import TarragonTitle from "../public/images/Tarragon_Title.svg";
import DiscordIcon from "../public/images/discord-icon.svg";

export default function Header() {
    const { openUserProfile } = useClerk();
    const currentUser = useQuery(api.users.getCurrentUser);
    const isDragon = currentUser?.role === 'dragon';
    const isMember = currentUser?.role === 'member' || isDragon;
    const pathname = usePathname();

    const handleJoinKobold = async () => {
        try {
            const res = await createKoboldCheckoutSessionAction(pathname);
            if (res?.url) {
                window.location.href = res.url;
            } else if (res?.error) {
                alert(res.error);
            }
        } catch (err: any) {
            alert(err?.message || "Failed to start checkout");
        }
    };

    const handleManageBilling = async () => {
        try {
            const res = await createCustomerPortalSessionAction(pathname);
            if (res?.url) {
                window.location.href = res.url;
            } else {
                openUserProfile();
            }
        } catch {
            openUserProfile();
        }
    };

    const membershipActionLabel = isDragon
        ? "Membership Status"
        : isMember
        ? "Manage Membership"
        : "Join Kobold (10€/yr)";

    const handleMembershipClick = () => {
        if (isDragon) {
            openUserProfile();
        } else if (isMember) {
            handleManageBilling();
        } else {
            handleJoinKobold();
        }
    };
    
    // Detect locale from pathname (e.g., /nl/page -> nl, /en/page -> en)
    const segments = pathname.split('/');
    const locale = (segments[1] === 'en' || segments[1] === 'nl') ? segments[1] : 'nl';
    
    // Determine the target for the toggle
    const targetLocale = locale === 'nl' ? 'en' : 'nl';
    
    // Create the target path for the toggle
    // If we are on a page like /nl/about, we want to go to /en/about
    // If we are on /event/xyz, we just go to /en (or /nl) because events don't have locales
    let toggleHref = `/${targetLocale}`;
    if (segments[1] === 'en' || segments[1] === 'nl') {
        const remainingPath = segments.slice(2).join('/');
        toggleHref = `/${targetLocale}${remainingPath ? '/' + remainingPath : ''}`;
    }

    return (
        <header>
            <Link href={`/${locale}`} className="header-logo">
                <Image
                    src={TarragonTiny}
                    alt="Tarragon Logo"
                    className="header-img"
                    width={35}
                    height={35}
                />
                <Image
                    src={TarragonTitle}
                    alt="Tarragon Title"
                    className="header-title"
                    width={150}
                    height={30}
                />
            </Link>
            <HeaderPages locale={locale} />
            <div className="header-right">
                <Link href={toggleHref} className="lang-toggle">
                    <Globe size={20} />
                    <span>{locale === 'nl' ? 'EN' : 'NL'}</span>
                </Link>
                <Link href="https://discord.com/invite/TjDUu2Gkag" className="discord-link">
                    <Image
                        src={DiscordIcon}
                        alt="Discord"
                        width={32}
                        height={32}
                        className="header-nav-icon"
                    />
                </Link>
                <div className="auth-container">
                    <SignedOut>
                        <SignInButton mode="modal">
                            <button className="auth-btn">
                                {locale === 'nl' ? 'Inloggen' : 'Sign In'}
                            </button>
                        </SignInButton>
                    </SignedOut>
                    <SignedIn>
                        <div className="user-profile-badge">
                            {isDragon && (
                                <Link href="/dragon" className="admin-header-btn">
                                    Admin
                                </Link>
                            )}
                            <UserButton>
                                <UserButton.MenuItems>
                                    <UserButton.Action
                                        label={membershipActionLabel}
                                        labelIcon={<span>🦎</span>}
                                        onClick={handleMembershipClick}
                                    />
                                </UserButton.MenuItems>
                                <UserButton.UserProfilePage
                                    label="Membership"
                                    url="membership"
                                    labelIcon={<span>🦎</span>}
                                >
                                    <MembershipSection />
                                </UserButton.UserProfilePage>
                            </UserButton>
                        </div>
                    </SignedIn>
                </div>
            </div>
        </header>
    );
}
