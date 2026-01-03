import React, { useState, useEffect } from 'react';
import { instrumentedFetch } from '../services/apiService';
import { API_URL } from '../lib/apiConfig';

const MALE_NAMES = ['Abdi', 'Mohamed', 'Ahmed', 'Hassan', 'Hussein', 'Farah', 'Ali', 'Omar', 'Ibrahim', 'Yusuf', 'Khalid', 'Mustafa', 'Jama', 'Guled', 'Liban'];
const FEMALE_NAMES = ['Asha', 'Fadumo', 'Maryam', 'Khadija', 'Hibo', 'Sahra', 'Hodan', 'Nasra', 'Safia', 'Leyla', 'Nimo', 'Ubah', 'Idil', 'Sagal', 'Hani'];

interface WithdrawalTestimonial {
    userName: string;
    phone: string;
    amount: number;
    date: string;
    gender?: 'male' | 'female';
}

const WithdrawalTestimonials: React.FC = () => {
    const [testimonials, setTestimonials] = useState<WithdrawalTestimonial[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTestimonials();
    }, []);

    const getGenderPhrase = (name: string, gender?: 'male' | 'female') => {
        if (gender === 'female' || FEMALE_NAMES.includes(name)) {
            return 'waxay labaxday';
        }
        return 'wuxuu labaxay';
    };

    const generateFakeTestimonials = () => {
        const fakes: WithdrawalTestimonial[] = [];
        for (let i = 0; i < 50; i++) {
            const isMale = Math.random() > 0.4;
            const nameList = isMale ? MALE_NAMES : FEMALE_NAMES;
            const name = nameList[Math.floor(Math.random() * nameList.length)];
            const randomAmount = Math.floor(Math.random() * 110) + 1;
            const randomPhoneSuffix = Math.floor(Math.random() * 900) + 100;
            const phone = `61*****${randomPhoneSuffix}`;

            fakes.push({
                userName: name,
                phone: phone,
                amount: randomAmount,
                date: new Date().toISOString(),
                gender: isMale ? 'male' : 'female'
            });
        }
        return fakes;
    };

    const fetchTestimonials = async () => {
        let allData: WithdrawalTestimonial[] = [];
        allData = generateFakeTestimonials();

        try {
            const url = `${API_URL}/public/withdrawals/testimonials?limit=30`;
            const { responseData } = await instrumentedFetch(url, {
                method: 'GET',
            });

            if (responseData.success && responseData.testimonials && responseData.testimonials.length > 0) {
                const realData = responseData.testimonials.map((t: WithdrawalTestimonial) => ({
                    ...t,
                    phone: t.phone.replace(/^(?:252|0)?(6\d)(?:\d+)(\d{3})$/, '$1*****$2')
                }));

                allData = [...realData, ...allData];
            }
        } catch (error) {
            console.error('Failed to fetch testimonials, using generated data only:', error);
        } finally {
            setTestimonials([...allData, ...allData, ...allData]);
            setLoading(false);
        }
    };

    if (loading || testimonials.length === 0) {
        return null;
    }

    return (
        <div className="w-full bg-green-900/10 border-y border-green-500/20 py-2 overflow-hidden backdrop-blur-sm mb-3">
            <div className="relative flex overflow-x-hidden">
                <div className="animate-marquee whitespace-nowrap flex items-center gap-12">
                    {testimonials.map((t, i) => (
                        <div key={i} className="flex items-center gap-2 text-emerald-400 font-bold">
                            <span className="text-lg">💰</span>
                            <span className="text-emerald-300">{t.userName}</span>
                            <span className="text-xs text-emerald-500/80">({t.phone})</span>
                            <span className="text-xs font-medium text-emerald-400/90">{getGenderPhrase(t.userName, t.gender)}</span>
                            <span className="font-black text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                ${t.amount.toFixed(2)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <style>{`
                .animate-marquee {
                    animation: marquee 180s linear infinite;
                }
                
                .animate-marquee:hover {
                    animation-play-state: paused;
                }

                @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
            `}</style>
        </div>
    );
};

export default WithdrawalTestimonials;
